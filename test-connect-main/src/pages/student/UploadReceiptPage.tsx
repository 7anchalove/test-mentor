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
import { ArrowLeft, FileUp, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import {
  sendRequestSubmittedEmail,
  submitBookingForReview,
  uploadReceiptAndAttachToBooking,
  validateReceiptFile,
} from "@/lib/bookings";

type TestCategory = Database["public"]["Enums"]["test_category"];

export default function UploadReceiptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const bookingId = searchParams.get("bookingId") || "";
  const category = (searchParams.get("category") as TestCategory) || ("" as TestCategory);
  const subtype = searchParams.get("subtype") || null;
  const datetimeStr = searchParams.get("datetime") || "";

  const [file, setFile] = useState<File | null>(null);

  const canSubmit = useMemo(() => {
    if (!user) return false;
    if (!bookingId) return false;
    if (validateReceiptFile(file) !== null) return false;
    return true;
  }, [user, bookingId, file]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!bookingId) throw new Error("Missing bookingId");

      const validationError = validateReceiptFile(file);
      if (validationError) throw new Error(validationError);

      await uploadReceiptAndAttachToBooking({
        bookingId,
        studentId: user.id,
        file: file!,
      });

      await submitBookingForReview({
        bookingId,
        studentId: user.id,
      });

      await sendRequestSubmittedEmail({
        toEmail: user.email,
        category,
        subtype,
        datetimeStr,
      });

      return bookingId;
    },
    onSuccess: () => {
      toast({
        title: "Request sent successfully",
        description: "Your receipt was uploaded and your request is now pending teacher review.",
      });
      queryClient.invalidateQueries({ queryKey: ["student-requests", user?.id] });
      navigate("/pending-requests", { replace: true });
    },
    onError: (err: any) => {
      toast({
        title: "Could not send request",
        description: err?.message ?? "Please try again.",
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
            Receipt upload is required before your request is submitted for teacher review.
          </p>
        </div>

        {!bookingId ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Missing booking reference. Start from the teachers page to create a request draft first.
              </p>
              <Button onClick={() => navigate("/teachers", { replace: true })} className="w-full">
                Go to Teachers
              </Button>
            </CardContent>
          </Card>
        ) : (

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
                <Label htmlFor="receipt">Receipt file (PDF / PNG / JPEG, max 10MB)</Label>
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
                    const validationError = validateReceiptFile(f);
                    if (validationError) {
                      toast({
                        title: "Invalid receipt file",
                        description: validationError,
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
                    Uploading a receipt is mandatory. Your request will not be submitted without it.
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                disabled={!canSubmit || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Submitting..." : "Submit request"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
