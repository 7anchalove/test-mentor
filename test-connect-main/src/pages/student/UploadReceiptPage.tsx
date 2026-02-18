import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileUp, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type TestCategory = Database["public"]["Enums"]["test_category"];

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

function getExtFromFile(file: File) {
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot >= 0) return name.slice(dot + 1).toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  return "bin";
}

export default function UploadReceiptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const teacherId = searchParams.get("teacherId") || "";
  const category = (searchParams.get("category") as TestCategory) || ("" as TestCategory);
  const subtype = searchParams.get("subtype") || null;
  const datetimeStr = searchParams.get("datetime") || "";

  const [file, setFile] = useState<File | null>(null);

  const canSubmit = useMemo(() => {
    if (!user) return false;
    if (!teacherId || !category || !datetimeStr) return false;
    if (!file) return false;
    if (!ACCEPTED_MIME.has(file.type)) return false;
    return true;
  }, [user, teacherId, category, datetimeStr, file]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!file) throw new Error("Receipt is required");
      if (!ACCEPTED_MIME.has(file.type)) throw new Error("Only PDF, PNG, or JPEG files are allowed");

      // 1) Upload receipt to Storage (path is prefixed by student id for RLS)
      const ext = getExtFromFile(file);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const receiptPath = `${user.id}/${Date.now()}_${crypto.randomUUID()}_${safeName}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("booking-receipts")
        .upload(receiptPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (upErr) throw upErr;

      // 2) Create student test selection
      const { data: selection, error: selErr } = await supabase
        .from("student_test_selections")
        .insert({
          student_id: user.id,
          test_category: category,
          test_subtype: subtype,
          test_date_time: datetimeStr,
        })
        .select()
        .single();
      if (selErr) throw selErr;

      // 3) Create booking request (pending)
      const { data: booking, error: bookErr } = await supabase
        .from("bookings")
        .insert({
          student_id: user.id,
          teacher_id: teacherId,
          student_test_selection_id: selection.id,
          start_date_time: datetimeStr,
          status: "pending",
          receipt_path: receiptPath,
          receipt_mime: file.type,
          receipt_original_name: file.name,
        } as any)
        .select()
        .single();
      if (bookErr) throw bookErr;
      if (!booking) throw new Error("Booking request could not be created");

      // 4) Email confirmation to student (best-effort)
      try {
        await supabase.functions.invoke("booking-notify", {
          body: {
            kind: "request_submitted",
            to: user.email,
            payload: {
              test_category: category,
              test_subtype: subtype,
              test_date_time: datetimeStr,
            },
          },
        });
      } catch {
        // Ignore (email is best-effort)
      }

      return booking;
    },
    onSuccess: () => {
      toast({
        title: "Request sent successfully",
        description: "Your receipt was uploaded and your request is now pending teacher approval.",
      });
      queryClient.invalidateQueries({ queryKey: ["student-requests", user?.id] });
      navigate("/pending-requests", { replace: true });
    },
    onError: (err: any) => {
      const isCapacityFull =
        err?.message?.includes("CAPACITY_FULL") ||
        err?.message?.toLowerCase?.().includes("capacity") ||
        err?.message?.toLowerCase?.().includes("slot is full");

      toast({
        title: "Could not send request",
        description: isCapacityFull
          ? "This time slot is full for this teacher. Please pick another time or teacher."
          : err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const selectedDate = datetimeStr ? new Date(datetimeStr) : null;

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl">
        <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold font-display">Upload booking receipt</h1>
          <p className="mt-2 text-muted-foreground">
            Receipt upload is required before your request is sent to the teacher.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div className="text-sm">
                  <div className="font-medium">Request details</div>
                  <div className="text-muted-foreground mt-1">
                    {category ? category.replaceAll("_", " ") : ""}
                    {subtype ? ` (${subtype})` : ""}
                    {selectedDate ? (
                      <> — {format(selectedDate, "EEEE, MMMM d 'at' HH:mm")}</>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt">Receipt file (PDF / PNG / JPEG)</Label>
              <Input
                id="receipt"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (!f) {
                    setFile(null);
                    return;
                  }
                  if (!ACCEPTED_MIME.has(f.type)) {
                    toast({
                      title: "Invalid file type",
                      description: "Please upload a PDF, PNG, or JPEG file.",
                      variant: "destructive",
                    });
                    e.target.value = "";
                    setFile(null);
                    return;
                  }
                  setFile(f);
                }}
              />
              {file ? (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileUp className="h-3.5 w-3.5" /> {file.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Uploading a receipt is mandatory. Your request will not be sent without it.
                </p>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Sending..." : "Send request"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
