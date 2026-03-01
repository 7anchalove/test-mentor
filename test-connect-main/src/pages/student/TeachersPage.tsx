import { useEffect, useMemo, useState } from "react";
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
  avatarUrl: string | null;
  headline: string | null;
  subjects: string[] | null;
  isAvailable: boolean;
  spotsLeft: number;
  computedCapacity: number;
}

type AvailabilityRpcRow = Database["public"]["Functions"]["get_teachers_availability"]["Returns"][number];

const isAvailabilityDebugEnabled = !import.meta.env.PROD;

const TeachersPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bookingTeacherId, setBookingTeacherId] = useState<string | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedReceipt, setUploadedReceipt] = useState<UploadedReceipt | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const category = searchParams.get("category") as TestCategory;
  const subtype = searchParams.get("subtype") || null;
  const datetimeStr = searchParams.get("datetime") || "";
  const selectedDate = datetimeStr ? new Date(datetimeStr) : null;
  const datetimeUtcIso = selectedDate && !Number.isNaN(selectedDate.getTime()) ? selectedDate.toISOString() : "";

  const canUploadReceipt = useMemo(() => {
    return validateReceiptFile(selectedFile) === null;
  }, [selectedFile]);

  const canSubmitReceipt = useMemo(() => {
    if (!user || !selectedTeacherId || !datetimeStr || !category) return false;
    return Boolean(receiptUrl?.trim() && uploadedReceipt);
  }, [user, selectedTeacherId, datetimeStr, category, receiptUrl, uploadedReceipt]);

  const resetReceiptFlow = () => {
    setReceiptDialogOpen(false);
    setSelectedFile(null);
    setSelectedTeacherId(null);
    setUploadedReceipt(null);
    setReceiptUrl(null);
    setError(null);
    setBookingTeacherId(null);
  };

  const uploadReceiptMutation = useMutation({
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
      setError(err?.message ?? "Receipt upload failed. Please try again.");
      toast({
        title: "Upload failed",
        description: err?.message ?? "Receipt upload failed. Please try again.",
        variant: "destructive",
      });
    },
  });

  const sendRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!selectedTeacherId) throw new Error("Please select a teacher");
      if (!category || !datetimeStr) throw new Error("Missing test category or date/time");
      if (!uploadedReceipt || !receiptUrl?.trim()) {
        setError("Upload a receipt before submitting");
        throw new Error("Upload a receipt before submitting");
      }

      const booking = await createBookingRequest({
        studentId: user.id,
        teacherId: selectedTeacherId,
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

      return booking;
    },
    onSuccess: () => {
      setError(null);
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

      const title = isDuplicateBooking
        ? "Request already exists"
        : isCapacityFull
          ? "Time slot full"
          : "Request failed";

      const message = isDuplicateBooking
        ? "You already have a booking request for this time slot. Pick a different time or cancel the existing request first."
        : isCapacityFull
          ? "This time slot is fully booked. Please choose a different time or another teacher."
          : "We couldn't submit your request right now. Please try again in a moment.";

      setError(message);
      toast({
        title,
        description: message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setBookingTeacherId(null);
    },
  });

  const isUploading = uploadReceiptMutation.isPending;
  const isSubmitting = sendRequestMutation.isPending;

  const {
    data: teachers,
    isLoading,
    isError,
    error: teachersError,
  } = useQuery({
    queryKey: ["teachers-availability", datetimeUtcIso, category],
    queryFn: async (): Promise<TeacherWithAvailability[]> => {
      if (isAvailabilityDebugEnabled) {
        console.debug("[TeachersPage] RPC payload", {
          p_datetime_utc: datetimeUtcIso,
          p_test_category: category || null,
        });
      }

      const { data: availabilityRows, error: availErr } = await supabase.rpc("get_teachers_availability", {
        p_datetime_utc: datetimeUtcIso,
        p_test_category: category || null,
      });
      if (availErr) throw availErr;

      const availableRows = ((availabilityRows ?? []) as AvailabilityRpcRow[]).filter(
        (row) => row.is_available === true
      );

      if (isAvailabilityDebugEnabled) {
        console.debug("[TeachersPage] RPC response", {
          totalRows: (availabilityRows ?? []).length,
          availableRows: availableRows.length,
          firstRow: (availabilityRows ?? [])[0] ?? null,
        });
      }

      if (!availableRows.length) return [];

      const teacherIds = availableRows.map((row) => row.teacher_id);

      const [profilesRes, teacherProfilesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, name, bio, avatar_url, role")
          .in("user_id", teacherIds)
          .eq("role", "teacher"),
        supabase
          .from("teacher_profiles")
          .select("user_id, headline, subjects")
          .in("user_id", teacherIds),
      ]);

      const { data: profileRows, error: profilesErr } = profilesRes;
      if (profilesErr) throw profilesErr;

      const { data: teacherProfileRows, error: teacherProfilesErr } = teacherProfilesRes;
      if (teacherProfilesErr) throw teacherProfilesErr;

      if (isAvailabilityDebugEnabled) {
        console.debug("[TeachersPage] Profiles fetched", {
          profiles: (profileRows ?? []).length,
          teacherProfiles: (teacherProfileRows ?? []).length,
        });
      }

      const profileByUserId = new Map((profileRows ?? []).map((row) => [row.user_id, row]));
      const teacherProfileByUserId = new Map((teacherProfileRows ?? []).map((row) => [row.user_id, row]));

      return availableRows.map((rpcRow) => {
        const profile = profileByUserId.get(rpcRow.teacher_id);
        const teacherProfile = teacherProfileByUserId.get(rpcRow.teacher_id);
        return {
          userId: rpcRow.teacher_id,
          name: profile?.name || "Unknown Teacher",
          bio: profile?.bio,
          avatarUrl: profile?.avatar_url ?? null,
          headline: teacherProfile?.headline ?? null,
          subjects: teacherProfile?.subjects ?? null,
          isAvailable: rpcRow.is_available,
          spotsLeft: rpcRow.spots_left ?? 0,
          computedCapacity: rpcRow.computed_capacity ?? 4,
        };
      });
    },
    enabled: !!datetimeUtcIso,
  });

  useEffect(() => {
    if (!isError || !teachersError) return;
    const message = teachersError instanceof Error ? teachersError.message : "Failed to load teachers.";
    if (isAvailabilityDebugEnabled) {
      console.error("[TeachersPage] Availability query failed", teachersError);
    }
    toast({
      title: "Failed to load teachers",
      description: message,
      variant: "destructive",
    });
  }, [isError, teachersError, toast]);

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
    setSelectedFile(null);
    setUploadedReceipt(null);
    setReceiptUrl(null);
    setError(null);
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
            {selectedDate ? format(selectedDate, "EEEE, MMMM d 'at' HH:mm") : "Invalid date/time"}
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
                        {teacher.avatarUrl ? (
                          <img
                            src={teacher.avatarUrl}
                            alt={teacher.name}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <User className="h-6 w-6 text-muted-foreground" />
                        )}
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
                Booking is inserted only after receipt upload succeeds.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="font-medium">Request details</div>
                <div className="mt-1 text-muted-foreground">
                  Teacher: {selectedTeacher?.name ?? "Selected teacher"}
                  <br />
                  {category ? category.replace(/_/g, " ") : ""}
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
                  disabled={isUploading || isSubmitting}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setError(null);
                    setUploadedReceipt(null);
                    setReceiptUrl(null);

                    if (!file) {
                      setSelectedFile(null);
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
                      setSelectedFile(null);
                      return;
                    }

                    setSelectedFile(file);
                  }}
                />

                {receiptUrl ? (
                  <p className="flex items-center gap-2 text-xs text-success">
                    <ReceiptText className="h-3.5 w-3.5" /> Receipt uploaded: {uploadedReceipt?.receiptOriginalName ?? selectedFile?.name ?? "Receipt file"}
                  </p>
                ) : selectedFile ? (
                  <p className="text-xs text-muted-foreground">Selected: {selectedFile.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Receipt is required before your request can be created.</p>
                )}

                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetReceiptFlow} disabled={isUploading || isSubmitting}>
                Cancel
              </Button>
              <Button
                variant="outline"
                disabled={!canUploadReceipt || isUploading || isSubmitting}
                onClick={() => uploadReceiptMutation.mutate()}
              >
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {isUploading ? "Uploading..." : "Upload receipt"}
              </Button>
              <Button
                disabled={!canSubmitReceipt || isSubmitting}
                onClick={() => sendRequestMutation.mutate()}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Submitting..." : "Submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default TeachersPage;
