import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { BookOpen, CalendarIcon, Clock } from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { BOOKING_STATUS } from "@/lib/bookingStatus";
import { assertPaymentStatus, PAYMENT_STATUS, type PaymentStatus } from "@/lib/paymentStatus";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type SelectionRow = Database["public"]["Tables"]["student_test_selections"]["Row"];

type TeacherPaymentBooking = Pick<
  BookingRow,
  "id" | "status" | "start_date_time" | "student_id" | "teacher_id" | "student_test_selection_id" | "payment_status" | "payment_note" | "paid_at"
> & {
  student: { name: string | null; email: string | null } | null;
  selection: Pick<SelectionRow, "test_category" | "test_subtype"> | null;
};

async function loadTeacherPaymentBookings(teacherId: string): Promise<TeacherPaymentBooking[]> {
  const { data: bookingRows, error: bookingError } = await supabase
    .from("bookings")
    .select("id, status, start_date_time, student_id, teacher_id, student_test_selection_id, payment_status, payment_note, paid_at")
    .eq("teacher_id", teacherId)
    .eq("status", BOOKING_STATUS.CONFIRMED)
    .order("start_date_time", { ascending: true });

  if (bookingError) throw bookingError;
  if (!bookingRows?.length) return [];

  const studentIds = [...new Set(bookingRows.map((booking) => booking.student_id))];
  const selectionIds = bookingRows.map((booking) => booking.student_test_selection_id);

  const [{ data: profiles, error: profilesError }, { data: selections, error: selectionsError }] = await Promise.all([
    supabase.from("profiles").select("user_id, name, email").in("user_id", studentIds),
    supabase
      .from("student_test_selections")
      .select("id, test_category, test_subtype")
      .in("id", selectionIds),
  ]);

  if (profilesError) throw profilesError;
  if (selectionsError) throw selectionsError;

  return bookingRows.map((booking) => ({
    ...booking,
    student: profiles?.find((profile) => profile.user_id === booking.student_id) ?? null,
    selection: selections?.find((selection) => selection.id === booking.student_test_selection_id) ?? null,
  }));
}

const TeacherPaymentsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [noteDraftByBooking, setNoteDraftByBooking] = useState<Record<string, string>>({});

  const {
    data: bookings = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["teacher-payments", user?.id],
    enabled: !!user?.id,
    queryFn: async () => loadTeacherPaymentBookings(user!.id),
  });

  useEffect(() => {
    setNoteDraftByBooking((current) => {
      const next = { ...current };
      for (const booking of bookings) {
        if (next[booking.id] === undefined) {
          next[booking.id] = booking.payment_note ?? "";
        }
      }
      return next;
    });
  }, [bookings]);

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ bookingId, paymentStatus }: { bookingId: string; paymentStatus: PaymentStatus }) => {
      const nextStatus = assertPaymentStatus(paymentStatus, "TeacherPaymentsPage.updatePaymentMutation");

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ payment_status: nextStatus })
        .eq("id", bookingId)
        .eq("teacher_id", user?.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast({ title: "Payment status updated" });
      queryClient.invalidateQueries({ queryKey: ["teacher-payments", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["booking-info"] });
    },
    onError: (mutationError: any) => {
      toast({
        title: "Could not update payment status",
        description: mutationError?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ bookingId, note }: { bookingId: string; note: string }) => {
      const normalized = note.trim();

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ payment_note: normalized.length ? normalized : null })
        .eq("id", bookingId)
        .eq("teacher_id", user?.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast({ title: "Payment note saved" });
      queryClient.invalidateQueries({ queryKey: ["teacher-payments", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["booking-info"] });
    },
    onError: (mutationError: any) => {
      toast({
        title: "Could not save payment note",
        description: mutationError?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Payments</h1>
          <p className="text-sm text-muted-foreground">Track offline payments for confirmed bookings.</p>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">Loading payment bookings...</CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load payments</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && bookings.length === 0 && (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No confirmed bookings yet.
            </CardContent>
          </Card>
        )}

        {!isLoading &&
          !error &&
          bookings.map((booking) => {
            const noteDraft = noteDraftByBooking[booking.id] ?? "";
            const isSavingThisNote = saveNoteMutation.isPending && saveNoteMutation.variables?.bookingId === booking.id;
            const isUpdatingThisPayment =
              updatePaymentMutation.isPending && updatePaymentMutation.variables?.bookingId === booking.id;

            return (
              <Card key={booking.id}>
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{booking.student?.name || "Student"}</CardTitle>
                    <StatusBadge status={booking.payment_status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {booking.selection?.test_category?.replace("_", " ") || "Test"}
                      {booking.selection?.test_subtype ? ` (${booking.selection.test_subtype})` : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {format(new Date(booking.start_date_time), "MMM d, yyyy")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(booking.start_date_time), "HH:mm")}
                    </span>
                  </div>

                  {booking.paid_at && (
                    <p className="text-xs text-muted-foreground">Paid at: {format(new Date(booking.paid_at), "MMM d, yyyy HH:mm")}</p>
                  )}
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={isUpdatingThisPayment || booking.payment_status === PAYMENT_STATUS.PAID}
                      onClick={() =>
                        updatePaymentMutation.mutate({
                          bookingId: booking.id,
                          paymentStatus: PAYMENT_STATUS.PAID,
                        })
                      }
                    >
                      {isUpdatingThisPayment && updatePaymentMutation.variables?.paymentStatus === PAYMENT_STATUS.PAID
                        ? "Saving..."
                        : "Mark as paid"}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUpdatingThisPayment || booking.payment_status === PAYMENT_STATUS.NOT_PAID}
                      onClick={() =>
                        updatePaymentMutation.mutate({
                          bookingId: booking.id,
                          paymentStatus: PAYMENT_STATUS.NOT_PAID,
                        })
                      }
                    >
                      {isUpdatingThisPayment && updatePaymentMutation.variables?.paymentStatus === PAYMENT_STATUS.NOT_PAID
                        ? "Saving..."
                        : "Not paid"}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Textarea
                      value={noteDraft}
                      onChange={(event) =>
                        setNoteDraftByBooking((current) => ({
                          ...current,
                          [booking.id]: event.target.value,
                        }))
                      }
                      placeholder="Optional payment note"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isSavingThisNote}
                      onClick={() => saveNoteMutation.mutate({ bookingId: booking.id, note: noteDraft })}
                    >
                      {isSavingThisNote ? "Saving..." : "Save note"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </AppLayout>
  );
};

export default TeacherPaymentsPage;