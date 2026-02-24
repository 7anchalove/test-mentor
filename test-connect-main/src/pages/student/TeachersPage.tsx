import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle, Loader2, ReceiptText, Upload, User, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/layout/AppLayout";
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

interface TeacherWithAvailability {
  userId: string;
  name: string;
  bio: string | null;
  headline: string | null;
  subjects: string[] | null;
  isAvailable: boolean;
  spotsLeft: number;
  computedCapacity: number;
}

type SubmitStage = "idle" | "uploading" | "creating";

const TeachersPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bookingTeacherId, setBookingTeacherId] = useState<string | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadedReceipt, setUploadedReceipt] = useState<UploadedReceipt | null>(null);
  const [submitStage, setSubmitStage] = useState<SubmitStage>("idle");

  const category = searchParams.get("category") as TestCategory;
  const subtype = searchParams.get("subtype") || null;
  const datetimeStr = searchParams.get("datetime") || "";
  const selectedDate = new Date(datetimeStr);

  const canSubmitReceipt = useMemo(() => {
    if (!user || !selectedTeacherId || !datetimeStr || !category) return false;
    if (uploadedReceipt) return true;
    return validateReceiptFile(receiptFile) === null;
  }, [user, selectedTeacherId, datetimeStr, category, receiptFile, uploadedReceipt]);

  const resetReceiptFlow = () => {
    setReceiptDialogOpen(false);
    setReceiptFile(null);
    setSelectedTeacherId(null);
    setUploadedReceipt(null);
    setSubmitStage("idle");
    setBookingTeacherId(null);
  };

  const sendRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!selectedTeacherId) throw new Error("Please select a teacher");
      if (!category || !datetimeStr) throw new Error("Missing test category or date/time");

      let receipt = uploadedReceipt;
      if (!receipt) {
        const validationError = validateReceiptFile(receiptFile);
        if (validationError) throw new Error(validationError);

        setSubmitStage("uploading");
        receipt = await uploadReceipt({
          studentId: user.id,
          file: receiptFile!,
        });
        setUploadedReceipt(receipt);
      }

      setSubmitStage("creating");
      const booking = await createBookingRequest({
        studentId: user.id,
        teacherId: selectedTeacherId,
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

      return booking;
    },
    onSuccess: () => {
      toast({
        title: "Request submitted",
        description: "Your receipt was uploaded and your request has been sent to the teacher.",
      });
      queryClient.invalidateQueries({ queryKey: ["student-requests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teachers-availability", datetimeStr, category] });
      resetReceiptFlow();
      navigate("/pending-requests", { replace: true });
    },
    onError: (err: any) => {
      const isDuplicateBooking = isDuplicateActiveBookingError(err);
      const isCapacityFull =
        err?.message?.includes("CAPACITY_FULL") ||
        err?.message?.toLowerCase?.().includes("capacity") ||
        err?.message?.toLowerCase?.().includes("slot is full");

      toast({
        title: "Could not submit request",
        description: isDuplicateBooking
          ? "You already have a request at this time. Please choose another time."
          : isCapacityFull
            ? "This time slot is full for this teacher. Please pick another time or teacher."
            : err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setSubmitStage("idle");
      setBookingTeacherId(null);
    },
  });

  const { data: teachers, isLoading } = useQuery({
    queryKey: ["teachers-availability", datetimeStr, category],
    queryFn: async (): Promise<TeacherWithAvailability[]> => {
      const [teachersRes, availabilityRes] = await Promise.all([
        (async () => {
          const { data: teacherProfiles, error: tpErr } = await supabase
            .from("teacher_profiles")
            .select("user_id, headline, subjects")
            .eq("is_active", true);
          if (tpErr) throw tpErr;
          if (!teacherProfiles?.length) return { profiles: [], teacherProfiles: [] };

          const teacherIds = teacherProfiles.map((tp) => tp.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, name, bio")
            .in("user_id", teacherIds);
          return { profiles: profiles ?? [], teacherProfiles };
        })(),
        supabase.rpc("get_teachers_availability", {
          p_datetime_utc: datetimeStr,
          p_test_category: category || null,
        }),
      ]);

      const { teacherProfiles, profiles } = teachersRes;
      if (!teacherProfiles?.length) return [];

      const { data: availabilityRows, error: availErr } = availabilityRes;
      if (availErr) throw availErr;

      const rowByTeacher = new Map(
        (availabilityRows ?? []).map((row) => [
          row.teacher_id,
          {
            is_available: row.is_available,
            spots_left: row.spots_left ?? 0,
            computed_capacity: row.computed_capacity ?? 4,
          },
        ])
      );

      return teacherProfiles.map((tp) => {
        const profile = profiles?.find((p) => p.user_id === tp.user_id);
        const avail = rowByTeacher.get(tp.user_id);
        const isAvailable = avail?.is_available ?? false;
        const spotsLeft = avail?.spots_left ?? 0;
        const computedCapacity = avail?.computed_capacity ?? 4;
        return {
          userId: tp.user_id,
          name: profile?.name || "Unknown Teacher",
          bio: profile?.bio,
          headline: tp.headline,
          subjects: tp.subjects,
          isAvailable,
          spotsLeft,
          computedCapacity,
        };
      });
    },
    enabled: !!datetimeStr,
  });

  const handleSelectTeacher = (teacherId: string) => {
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be logged in to send a booking request.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    setBookingTeacherId(teacherId);
    setSelectedTeacherId(teacherId);
    setReceiptFile(null);
    setUploadedReceipt(null);
    setSubmitStage("idle");
    setReceiptDialogOpen(true);
  };

  const selectedTeacher = teachers?.find((teacher) => teacher.userId === selectedTeacherId) ?? null;

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Available Teachers</h1>
          <p className="mt-2 text-muted-foreground">
            For {category?.replace("_", " ") || "test"} {subtype ? `(${subtype})` : ""} on{" "}
            {format(selectedDate, "EEEE, MMMM d 'at' HH:mm")}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !teachers?.length ? (
          <div className="py-12 text-center text-muted-foreground">
            <User className="mx-auto mb-4 h-12 w-12 opacity-30" />
            <p>No teachers found. Try a different date or time.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {teachers
              .sort((a, b) => (a.isAvailable === b.isAvailable ? 0 : a.isAvailable ? -1 : 1))
              .map((teacher) => (
                <Card key={teacher.userId} className="transition-all hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold font-display">{teacher.name}</h3>
                        {teacher.headline && (
                          <p className="text-sm text-muted-foreground">{teacher.headline}</p>
                        )}
                        {teacher.subjects?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {teacher.subjects.map((subject) => (
                              <Badge key={subject} variant="secondary" className="text-xs">
                                {subject}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={teacher.isAvailable ? "default" : "secondary"} className={`gap-1 ${teacher.isAvailable ? "bg-success text-success-foreground" : ""}`}>
                        {teacher.isAvailable ? (
                          <><CheckCircle className="h-3 w-3" /> Available</>
                        ) : (
                          <><XCircle className="h-3 w-3" /> Not available</>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Spots left: {teacher.spotsLeft}</span>
                      {teacher.isAvailable && (
                        <Button
                          size="sm"
                          disabled={bookingTeacherId !== null || sendRequestMutation.isPending}
                          onClick={() => handleSelectTeacher(teacher.userId)}
                        >
                          {bookingTeacherId === teacher.userId ? "Preparing..." : "Select"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}

        <Dialog
          open={receiptDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetReceiptFlow();
              return;
            }
            setReceiptDialogOpen(true);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload receipt and confirm request</DialogTitle>
              <DialogDescription>
                A booking request is created only after a successful receipt upload and confirmation.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="font-medium">Request details</div>
                <div className="mt-1 text-muted-foreground">
                  Teacher: {selectedTeacher?.name ?? "Selected teacher"}
                  <br />
                  {category ? category.replaceAll("_", " ") : ""}
                  {subtype ? ` (${subtype})` : ""}
                  {datetimeStr ? <> — {format(new Date(datetimeStr), "EEEE, MMMM d 'at' HH:mm")}</> : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt">Receipt file (PDF / PNG / JPEG, max 10MB)</Label>
                <Input
                  id="receipt"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  disabled={submitStage === "uploading" || sendRequestMutation.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) {
                      setReceiptFile(null);
                      setUploadedReceipt(null);
                      return;
                    }

                    const validationError = validateReceiptFile(file);
                    if (validationError) {
                      toast({
                        title: "Invalid receipt file",
                        description: validationError,
                        variant: "destructive",
                      });
                      e.target.value = "";
                      setReceiptFile(null);
                      setUploadedReceipt(null);
                      return;
                    }

                    setReceiptFile(file);
                    setUploadedReceipt(null);
                  }}
                />

                {uploadedReceipt ? (
                  <p className="flex items-center gap-2 text-xs text-success">
                    <ReceiptText className="h-3.5 w-3.5" /> Receipt uploaded. You can retry submit without re-upload.
                  </p>
                ) : receiptFile ? (
                  <p className="text-xs text-muted-foreground">Selected: {receiptFile.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Receipt is required before your request can be created.</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetReceiptFlow} disabled={sendRequestMutation.isPending}>
                Cancel
              </Button>
              <Button
                disabled={!canSubmitReceipt || sendRequestMutation.isPending}
                onClick={() => sendRequestMutation.mutate()}
              >
                {submitStage === "uploading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitStage === "creating" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitStage === "uploading"
                  ? "Uploading receipt..."
                  : submitStage === "creating"
                    ? "Creating request..."
                    : "Upload & submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default TeachersPage;
