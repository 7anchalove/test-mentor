import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import {
  createBookingRequest,
  isDuplicateActiveBookingError,
  sendRequestSubmittedEmail,
  type UploadedReceipt,
  uploadReceipt,
  validateReceiptFile,
} from "@/lib/bookings";

type TestCategory = Database["public"]["Enums"]["test_category"];

type SubmitStage = "idle" | "uploading" | "creating";

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
  const [uploadedReceipt, setUploadedReceipt] = useState<UploadedReceipt | null>(null);
  const [submitStage, setSubmitStage] = useState<SubmitStage>("idle");

  const canSubmit = useMemo(() => {
    if (!user || !teacherId || !category || !datetimeStr) return false;
    if (uploadedReceipt) return true;
    return validateReceiptFile(file) === null;
  }, [user, teacherId, category, datetimeStr, file, uploadedReceipt]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!teacherId) throw new Error("Missing teacher reference");
      if (!category || !datetimeStr) throw new Error("Missing category or date/time");

      let receipt = uploadedReceipt;
      if (!receipt) {
        const validationError = validateReceiptFile(file);
        if (validationError) throw new Error(validationError);

        setSubmitStage("uploading");
        receipt = await uploadReceipt({
          studentId: user.id,
          file: file!,
        });
        setUploadedReceipt(receipt);
      }

      setSubmitStage("creating");
      await createBookingRequest({
        studentId: user.id,
        teacherId,
        category,
        subtype,
        datetimeStr,
        receipt,
      });

      await sendRequestSubmittedEmail({
        toEmail: user.email,
        category,
        subtype,
        datetimeStr,
      });
    },
    onSuccess: () => {
      toast({
        title: "Request submitted",
        description: "Your receipt was uploaded and your booking request is now pending.",
      });
      queryClient.invalidateQueries({ queryKey: ["student-requests", user?.id] });
      navigate("/pending-requests", { replace: true });
    },
    onError: (err: any) => {
      const isDuplicateBooking = isDuplicateActiveBookingError(err);
      toast({
        title: "Could not submit request",
        description: isDuplicateBooking
          ? "You already have a request at this time. Please choose another time."
          : err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setSubmitStage("idle");
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
          <h1 className="text-3xl font-bold font-display">Upload receipt</h1>
          <p className="mt-2 text-muted-foreground">
            Booking is created only after receipt upload and final confirmation.
          </p>
        </div>

        {!teacherId || !category || !datetimeStr ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Missing request details. Please go back and reselect your teacher and time.
              </p>
              <Button onClick={() => navigate("/teachers", { replace: true })} className="w-full">
                Go to Teachers
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="text-sm">
                    <div className="font-medium">Request details</div>
                    <div className="mt-1 text-muted-foreground">
                      {category ? category.replaceAll("_", " ") : ""}
                      {subtype ? ` (${subtype})` : ""}
                      {selectedDate ? <> — {format(selectedDate, "EEEE, MMMM d 'at' HH:mm")}</> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt">Receipt file (PDF / PNG / JPEG, max 10MB)</Label>
                <Input
                  id="receipt"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  disabled={mutation.isPending}
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0] || null;
                    if (!selectedFile) {
                      setFile(null);
                      setUploadedReceipt(null);
                      return;
                    }

                    const validationError = validateReceiptFile(selectedFile);
                    if (validationError) {
                      toast({
                        title: "Invalid receipt file",
                        description: validationError,
                        variant: "destructive",
                      });
                      e.target.value = "";
                      setFile(null);
                      setUploadedReceipt(null);
                      return;
                    }

                    setFile(selectedFile);
                    setUploadedReceipt(null);
                  }}
                />

                {uploadedReceipt ? (
                  <p className="text-xs text-success">Receipt uploaded. You can retry submit without re-upload.</p>
                ) : file ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileUp className="h-3.5 w-3.5" /> {file.name}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Receipt is mandatory. No booking request is created until you submit.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="w-full" onClick={() => navigate(-1)} disabled={mutation.isPending}>
                  Cancel
                </Button>
                <Button className="w-full" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
                  {submitStage !== "idle" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitStage === "uploading"
                    ? "Uploading..."
                    : submitStage === "creating"
                      ? "Creating request..."
                      : "Upload & submit request"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
