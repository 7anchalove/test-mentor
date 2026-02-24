import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { BOOKING_STATUS, assertBookingStatus } from "@/lib/bookingStatus";

type TestCategory = Database["public"]["Enums"]["test_category"];

export const BOOKING_RECEIPTS_BUCKET = "booking-receipts";
export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_RECEIPT_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export function isDuplicateActiveBookingError(err: unknown) {
  const code = (err as any)?.code;
  const message = String((err as any)?.message ?? "").toLowerCase();
  const details = String((err as any)?.details ?? "").toLowerCase();

  return (
    code === "23505" ||
    message.includes("uniq_booking_student_time_active") ||
    details.includes("uniq_booking_student_time_active")
  );
}

function getExtFromFile(file: File) {
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot >= 0) return name.slice(dot + 1).toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  return "bin";
}

export function validateReceiptFile(file: File | null) {
  if (!file) return "Receipt is required";
  if (!ACCEPTED_RECEIPT_MIME.has(file.type)) {
    return "Only PDF, PNG, or JPEG files are allowed";
  }
  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    return "File is too large. Maximum size is 10MB";
  }
  return null;
}

export type UploadedReceipt = {
  receiptPath: string;
  receiptMime: string;
  receiptOriginalName: string;
};

export async function uploadReceipt(params: {
  studentId: string;
  file: File;
}): Promise<UploadedReceipt> {
  const { studentId, file } = params;

  const validationError = validateReceiptFile(file);
  if (validationError) throw new Error(validationError);

  const ext = getExtFromFile(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const receiptPath = `${studentId}/${Date.now()}_${crypto.randomUUID()}_${safeName}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BOOKING_RECEIPTS_BUCKET)
    .upload(receiptPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (upErr) throw upErr;

  return {
    receiptPath,
    receiptMime: file.type,
    receiptOriginalName: file.name,
  };
}

export async function createBookingRequest(params: {
  studentId: string;
  teacherId: string;
  category: TestCategory;
  subtype: string | null;
  datetimeStr: string;
  receipt: UploadedReceipt;
}) {
  const { studentId, teacherId, category, subtype, datetimeStr, receipt } = params;

  const status = assertBookingStatus(
    BOOKING_STATUS.PENDING,
    "createBookingRequest.insert(bookings)",
  );

  const { data: selection, error: selectionError } = await supabase
    .from("student_test_selections")
    .insert({
      student_id: studentId,
      test_category: category,
      test_subtype: subtype,
      test_date_time: datetimeStr,
    })
    .select("id")
    .single();

  if (selectionError) throw selectionError;

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      student_id: studentId,
      teacher_id: teacherId,
      student_test_selection_id: selection.id,
      start_date_time: datetimeStr,
      status,
      receipt_path: receipt.receiptPath,
      receipt_mime: receipt.receiptMime,
      receipt_original_name: receipt.receiptOriginalName,
    } as any)
    .select()
    .single();

  if (bookingError) throw bookingError;

  return booking;
}

export async function sendRequestSubmittedEmail(params: {
  toEmail: string | undefined;
  category?: string;
  subtype?: string | null;
  datetimeStr?: string;
}) {
  if (!params.toEmail) return;

  try {
    await supabase.functions.invoke("booking-notify", {
      body: {
        kind: "request_submitted",
        to: params.toEmail,
        payload: {
          test_category: params.category,
          test_subtype: params.subtype,
          test_date_time: params.datetimeStr,
        },
      },
    });
  } catch {
    // best-effort
  }
}
