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
import { ArrowLeft, CheckCircle, XCircle, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/layout/AppLayout";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type TestCategory = Database["public"]["Enums"]["test_category"];

const ACCEPTED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

function getExtFromFile(file: File) {
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot >= 0) return name.slice(dot + 1).toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  return "bin";
}

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

  const category = searchParams.get("category") as TestCategory;
  const subtype = searchParams.get("subtype") || null;
  const datetimeStr = searchParams.get("datetime") || "";
  const selectedDate = new Date(datetimeStr);

  const canSubmitReceipt = useMemo(() => {
    if (!user) return false;
    if (!selectedTeacherId) return false;
    if (!category || !datetimeStr) return false;
    if (!receiptFile) return false;
    if (!ACCEPTED_MIME.has(receiptFile.type)) return false;
    return true;
  }, [user, selectedTeacherId, category, datetimeStr, receiptFile]);

  const sendRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!selectedTeacherId) throw new Error("No teacher selected");
      if (!receiptFile) throw new Error("Receipt is required");
      if (!ACCEPTED_MIME.has(receiptFile.type)) {
        throw new Error("Only PDF, PNG, or JPEG files are allowed");
      }

      // 1) Upload receipt to Storage (path is prefixed by student id for Storage policies)
      const ext = getExtFromFile(receiptFile);
      const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const receiptPath = `${user.id}/${Date.now()}_${crypto.randomUUID()}_${safeName}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("booking-receipts")
        .upload(receiptPath, receiptFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: receiptFile.type,
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
          teacher_id: selectedTeacherId,
          student_test_selection_id: selection.id,
          start_date_time: datetimeStr,
          status: "pending",
          receipt_path: receiptPath,
          receipt_mime: receiptFile.type,
          receipt_original_name: receiptFile.name,
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
        // best-effort
      }

      return booking;
    },
    onSuccess: () => {
      toast({
        title: "Request sent successfully",
        description: "Your receipt was uploaded and your request is now pending teacher approval.",
      });
      queryClient.invalidateQueries({ queryKey: ["student-requests", user?.id] });
      setReceiptDialogOpen(false);
      setReceiptFile(null);
      setSelectedTeacherId(null);
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
    onSettled: () => {
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

    // Receipt is mandatory before sending a request — show a dialog in-place
    setSelectedTeacherId(teacherId);
    setReceiptFile(null);
    setReceiptDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Available Teachers</h1>
          <p className="mt-2 text-muted-foreground">
            For {category.replace("_", " ")} {subtype ? `(${subtype})` : ""} on{" "}
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
          <div className="text-center py-12 text-muted-foreground">
            <User className="mx-auto h-12 w-12 mb-4 opacity-30" />
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
                            {teacher.subjects.map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs">
                                {s}
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
                      <span className="text-xs text-muted-foreground">
                        Spots left: {teacher.spotsLeft}
                      </span>
                      {teacher.isAvailable && (
                        <Button
                          size="sm"
                          disabled={bookingTeacherId !== null}
                          onClick={() => handleSelectTeacher(teacher.userId)}
                        >
                          {bookingTeacherId === teacher.userId ? "Booking..." : "Select"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}

        {/* Receipt required dialog (student uploads before request is sent) */}
        <Dialog
          open={receiptDialogOpen}
          onOpenChange={(open) => {
            setReceiptDialogOpen(open);
            if (!open) {
              setReceiptFile(null);
              setSelectedTeacherId(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload booking receipt (required)</DialogTitle>
              <DialogDescription>
                Your request will only be sent after you upload a receipt (PDF / PNG / JPEG).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="font-medium">Request details</div>
                <div className="text-muted-foreground mt-1">
                  {category ? category.replaceAll("_", " ") : ""}
                  {subtype ? ` (${subtype})` : ""}
                  {datetimeStr ? (
                    <> — {format(new Date(datetimeStr), "EEEE, MMMM d 'at' HH:mm")}</>
                  ) : null}
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
                      setReceiptFile(null);
                      return;
                    }
                    if (!ACCEPTED_MIME.has(f.type)) {
                      toast({
                        title: "Invalid file type",
                        description: "Please upload a PDF, PNG, or JPEG file.",
                        variant: "destructive",
                      });
                      e.target.value = "";
                      setReceiptFile(null);
                      return;
                    }
                    setReceiptFile(f);
                  }}
                />
                {!receiptFile ? (
                  <p className="text-xs text-muted-foreground">
                    Receipt is required. You can’t send the request without it.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Selected: {receiptFile.name}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReceiptDialogOpen(false)}
                disabled={sendRequestMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedTeacherId) return;
                  setBookingTeacherId(selectedTeacherId);
                  sendRequestMutation.mutate();
                }}
                disabled={!canSubmitReceipt || sendRequestMutation.isPending}
              >
                {sendRequestMutation.isPending ? "Sending..." : "Send request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default TeachersPage;
