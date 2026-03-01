import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, FileUp, Loader2, ShieldCheck, Upload } from "lucide-react";
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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedReceipt, setUploadedReceipt] = useState<UploadedReceipt | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const canUpload = useMemo(() => validateReceiptFile(selectedFile) === null, [selectedFile]);
  const canSubmit = useMemo(() => {
    return Boolean(user && teacherId && category && datetimeStr && receiptUrl?.trim() && uploadedReceipt);
  }, [user, teacherId, category, datetimeStr, receiptUrl, uploadedReceipt]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const validationError = validateReceiptFile(selectedFile);
      if (validationError) throw new Error(validationError);

      const uploaded = await uploadReceipt({
        studentId: user.id,
        file: selectedFile!,
      });
      return uploaded;
    },
    onSuccess: (uploaded) => {
      setUploadedReceipt(uploaded);
      setReceiptUrl(uploaded.receiptUrl);
      setError(null);
      toast({
        title: "Receipt uploaded",
        description: "Receipt uploaded successfully. You can now submit your request.",
      });
    },
    onError: (err: any) => {
      const message = "Receipt upload failed. Please try again.";
      setError(message);
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!teacherId) throw new Error("Missing teacher reference");
      if (!category || !datetimeStr) throw new Error("Missing category or date/time");
      if (!uploadedReceipt || !receiptUrl?.trim()) {
        setError("Upload receipt before submitting");
        throw new Error("Upload receipt before submitting");
      }

      await createBookingRequest({
        studentId: user.id,
        teacherId,
        category,
        subtype,
        datetimeStr,
        receiptUrl: receiptUrl.trim(),
        receipt: uploadedReceipt,
      });

      await sendRequestSubmittedEmail({
        toEmail: user.email,
        category,
        subtype,
        datetimeStr,
      });
    },
    onSuccess: () => {
      setError(null);
      toast({
        title: "Request submitted",
        description: "Your receipt was uploaded and your booking request is now pending.",
      });
      queryClient.invalidateQueries({ queryKey: ["student-requests", user?.id] });
      navigate("/pending-requests", { replace: true });
    },
    onError: (err: any) => {
      const isDuplicateBooking = isDuplicateActiveBookingError(err);
      const title = isDuplicateBooking
        ? "Request already exists"
        : "Request failed";
      const message = isDuplicateBooking
        ? "You already have a booking request for this time slot. Pick a different time or cancel the existing request first."
        : "We couldn't submit your request right now. Please try again in a moment.";

      setError(message);
      toast({
        title,
        description: message,
        variant: "destructive",
      });
    },
  });

  const isUploading = uploadMutation.isPending;
  const isSubmitting = submitMutation.isPending;
  const submitBlockedByReceipt = !receiptUrl?.trim();

  const resetReceiptState = () => {
    setSelectedFile(null);
    setUploadedReceipt(null);
    setReceiptUrl(null);
    setError(null);
    setFileInputKey((value) => value + 1);
  };

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
            Your booking request will be created after you upload a valid receipt and confirm.
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
            <CardContent className="space-y-6 p-6">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">Step 2: Upload receipt</h2>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/50 p-4 shadow-sm">
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
                  key={fileInputKey}
                  id="receipt"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "receipt-error" : "receipt-help"}
                  disabled={isUploading || isSubmitting}
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0] || null;
                    setError(null);
                    setUploadedReceipt(null);
                    setReceiptUrl(null);

                    if (!selectedFile) {
                      setSelectedFile(null);
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
                      setSelectedFile(null);
                      return;
                    }

                    setSelectedFile(selectedFile);
                  }}
                />

                {receiptUrl ? (
                  <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-medium">Receipt uploaded successfully</span>
                      <Badge variant="secondary" className="ml-1 text-[11px]">Verified</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{uploadedReceipt?.receiptOriginalName ?? selectedFile?.name ?? "Receipt file"}</p>
                      <button
                        type="button"
                        className="text-xs text-primary underline underline-offset-2"
                        onClick={resetReceiptState}
                        disabled={isUploading || isSubmitting}
                      >
                        Change file
                      </button>
                    </div>
                  </div>
                ) : selectedFile ? (
                  <p id="receipt-help" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileUp className="h-3.5 w-3.5" /> {selectedFile.name}
                  </p>
                ) : (
                  <p id="receipt-help" className="text-xs text-muted-foreground">
                    Receipt is mandatory. No booking request is created until you submit.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    if (receiptUrl && !window.confirm("Discard uploaded receipt?")) return;
                    resetReceiptState();
                    navigate(-1);
                  }}
                  disabled={isUploading || isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canUpload || isUploading || isSubmitting}
                  onClick={() => uploadMutation.mutate()}
                  aria-busy={isUploading}
                >
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {isUploading ? "Uploading..." : "Upload receipt"}
                </Button>
                <Button className="w-full" disabled={!canSubmit || isSubmitting} onClick={() => submitMutation.mutate()} aria-busy={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Submitting request..." : "Submit request"}
                </Button>
                </div>
                {submitBlockedByReceipt && !isSubmitting && (
                  <p className="text-xs text-muted-foreground">Upload a receipt to continue.</p>
                )}
                {error && (
                  <div id="receipt-error" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
