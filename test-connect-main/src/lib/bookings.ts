import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { BOOKING_STATUS } from "@/lib/bookingStatus";

type TestCategory = Database["public"]["Enums"]["test_category"];

export const BOOKING_RECEIPTS_BUCKET = "booking-receipts";
export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_RECEIPT_MIME = new Set([
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
  if (!ALLOWED_RECEIPT_MIME.has(file.type)) {
    return "Only PDF, PNG, or JPEG files are allowed";
  }
  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    return "File is too large. Maximum size is 10MB";
  }
  return null;
}

export type UploadedReceipt = {
  receiptUrl: string;
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
    receiptUrl: receiptPath,
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
  receiptUrl: string;
  receipt: UploadedReceipt;
}) {
  const { studentId, teacherId, category, subtype, datetimeStr, receiptUrl, receipt } = params;
  const normalizedReceiptPath = receiptUrl?.trim();

  if (!normalizedReceiptPath) {
    throw new Error("Receipt upload is required before submitting");
  }

  const { data: booking, error: bookingError } = await supabase.rpc(
    "create_booking_request_with_selection" as any,
    {
      p_student_id: studentId,
      p_teacher_id: teacherId,
      p_test_category: category,
      p_test_subtype: subtype,
      p_start_date_time: datetimeStr,
      p_receipt_path: normalizedReceiptPath,
      p_receipt_mime: receipt.receiptMime,
      p_receipt_original_name: receipt.receiptOriginalName,
      p_status: BOOKING_STATUS.PENDING,
    } as any,
  );

  if (bookingError) throw bookingError;

  if (!booking) {
    throw new Error("Booking creation returned no row");
  }

  return booking as Database["public"]["Tables"]["bookings"]["Row"];
}

export async function cancelBooking(bookingId: string, reason?: string) {
  const payload: Database["public"]["Tables"]["bookings"]["Update"] = {
    status: BOOKING_STATUS.CANCELLED,
  };

  const normalizedReason = reason?.trim();
  if (normalizedReason) {
    payload.cancel_reason = normalizedReason;
  }

  const { error } = await supabase
    .from("bookings")
    .update(payload)
    .eq("id", bookingId);

  if (error) throw error;
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
