import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarIcon, Clock, MessageSquare, User, BookOpen } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useState } from "react";

const TeacherDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Realtime: toast when a new pending request arrives
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`teacher-booking-requests-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `teacher_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.status !== "pending") return;
          toast({
            title: "New booking request",
            description: "Open Requests to review it.",
          });
          queryClient.invalidateQueries({ queryKey: ["teacher-bookings", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast, queryClient]);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["teacher-bookings", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("teacher_id", user.id)
        .neq("status", "cancelled")
        .order("start_date_time", { ascending: true });

      if (error) throw error;
      if (!data?.length) return [];

      // Get student profiles
      const studentIds = [...new Set(data.map((b) => b.student_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", studentIds);

      // Get test selections
      const selIds = data.map((b) => b.student_test_selection_id);
      const { data: selections } = await supabase
        .from("student_test_selections")
        .select("*")
        .in("id", selIds);

      // Get conversations
      const bookingIds = data.map((b) => b.id);
      const { data: convos } = await supabase
        .from("conversations")
        .select("id, booking_id")
        .in("booking_id", bookingIds);

      return data.map((b) => ({
        ...b,
        student: profiles?.find((p) => p.user_id === b.student_id),
        selection: selections?.find((s) => s.id === b.student_test_selection_id),
        conversationId: convos?.find((c) => c.booking_id === b.id)?.id,
      }));
    },
    enabled: !!user,
  });

  const pending =
    bookings?.filter((b) => b.status === "pending") || [];
  const nonPending =
    bookings?.filter((b) => b.status !== "pending") || [];
  const upcoming = nonPending.filter((b) => new Date(b.start_date_time) >= new Date());
  const past = nonPending.filter((b) => new Date(b.start_date_time) < new Date());

  const acceptMutation = useMutation({
    mutationFn: async (booking: any) => {
      // Create (or reuse) a conversation for this booking
      const { data: convo, error: convoErr } = await supabase
        .from("conversations")
        .upsert(
          {
            student_id: booking.student_id,
            teacher_id: booking.teacher_id,
            booking_id: booking.id,
          },
          { onConflict: "booking_id" }
        )
        .select()
        .single();

      if (convoErr || !convo) throw convoErr ?? new Error("Could not create conversation");

      // Create (or reuse) a session row so this booking becomes a real appointment
      const start = new Date(booking.start_date_time);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 60);

      const { error: sessErr } = await supabase
        .from("sessions")
        .upsert(
          {
            booking_id: booking.id,
            conversation_id: convo.id,
            student_id: booking.student_id,
            teacher_id: booking.teacher_id,
            start_date_time: booking.start_date_time,
            end_date_time: end.toISOString(),
            status: "scheduled",
          },
          { onConflict: "booking_id" }
        );

      if (sessErr) throw sessErr;

      const { error: updateErr } = await supabase
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", booking.id);

      if (updateErr) throw updateErr;

      // Notify student by email (best-effort)
      try {
        await supabase.functions.invoke("booking-notify", {
          body: {
            kind: "request_accepted",
            to: booking.student?.email,
            payload: {
              test_category: booking.selection?.test_category,
              test_subtype: booking.selection?.test_subtype,
              test_date_time: booking.start_date_time,
            },
          },
        });
      } catch {
        // ignore
      }

      return convo;
    },
    onSuccess: () => {
      toast({
        title: "Request accepted",
        description: "Conversation created with the student.",
      });
      queryClient.invalidateQueries({ queryKey: ["teacher-bookings", user?.id] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not accept request",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (booking: any) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);

      if (error) throw error;

      // Notify student by email (best-effort)
      try {
        await supabase.functions.invoke("booking-notify", {
          body: {
            kind: "request_declined",
            to: booking.student?.email,
            payload: {
              test_category: booking.selection?.test_category,
              test_subtype: booking.selection?.test_subtype,
              test_date_time: booking.start_date_time,
            },
          },
        });
      } catch {
        // ignore
      }
    },
    onSuccess: () => {
      toast({
        title: "Request rejected",
      });
      queryClient.invalidateQueries({ queryKey: ["teacher-bookings", user?.id] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not reject request",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Your upcoming and past bookings</p>
        </div>

        {pending.length > 0 && (
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold font-display">Requests</h2>
              <Badge variant="outline">{pending.length}</Badge>
            </div>
            <div className="space-y-3">
              {pending.map((b) => (
                <RequestCard
                  key={b.id}
                  booking={b}
                  onAccept={() => acceptMutation.mutate(b)}
                  onReject={() => rejectMutation.mutate(b)}
                  isAccepting={
                    acceptMutation.isPending && acceptMutation.variables?.id === b.id
                  }
                  isRejecting={
                    rejectMutation.isPending && rejectMutation.variables?.id === b.id
                  }
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <Card>
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold font-display text-primary">{upcoming.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Upcoming</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold font-display">{past.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold font-display">{bookings?.length || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Total</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !bookings?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No bookings yet. Students will find you soon!</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold font-display mb-4">Upcoming</h2>
                <div className="space-y-3">
                  {upcoming.map((b) => (
                    <BookingCard key={b.id} booking={b} onChat={() => b.conversationId && navigate(`/chat/${b.conversationId}`)} />
                  ))}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold font-display mb-4">Past</h2>
                <div className="space-y-3">
                  {past.map((b) => (
                    <BookingCard key={b.id} booking={b} onChat={() => b.conversationId && navigate(`/chat/${b.conversationId}`)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

interface BookingCardProps {
  booking: {
    id: string;
    status: string;
    start_date_time: string;
    student?: { name: string; email: string } | null;
    selection?: { test_category: string; test_subtype: string | null; test_date_time: string } | null;
    conversationId?: string;
  };
  onChat: () => void;
}

const BookingCard: React.FC<BookingCardProps> = ({ booking, onChat }) => (
  <Card className="transition-all hover:shadow-md">
    <CardContent className="flex items-center justify-between gap-4 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold font-display">{booking.student?.name || "Student"}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {booking.selection && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                {booking.selection.test_category.replace("_", " ")}
                {booking.selection.test_subtype ? ` (${booking.selection.test_subtype})` : ""}
              </span>
            )}
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(new Date(booking.start_date_time), "MMM d")}
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(booking.start_date_time), "HH:mm")}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={booking.status === "confirmed" ? "default" : "secondary"}>
          {booking.status}
        </Badge>
        {booking.conversationId && (
          <Button size="sm" variant="outline" onClick={onChat} className="gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </Button>
        )}
      </div>
    </CardContent>
  </Card>
);

interface RequestCardProps {
  booking: any;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
  isRejecting: boolean;
}

const RequestCard: React.FC<RequestCardProps> = ({
  booking,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}) => {
  const [open, setOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const receiptPath = booking?.receipt_path as string | undefined;
  const receiptMime = (booking?.receipt_mime as string | undefined) ?? "";

  const isImage = useMemo(() => receiptMime.startsWith("image/"), [receiptMime]);
  const isPdf = useMemo(() => receiptMime === "application/pdf", [receiptMime]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!open) return;
      if (!receiptPath) return;
      setLoadingReceipt(true);
      const { data, error } = await supabase.storage
        .from("booking-receipts")
        .createSignedUrl(receiptPath, 60 * 60);
      if (!alive) return;
      setLoadingReceipt(false);
      if (error) {
        setSignedUrl(null);
        return;
      }
      setSignedUrl(data?.signedUrl ?? null);
    }
    load();
    return () => {
      alive = false;
    };
  }, [open, receiptPath]);

  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold font-display">{booking.student?.name || "Student"}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {booking.selection && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {booking.selection.test_category.replace("_", " ")}
                  {booking.selection.test_subtype ? ` (${booking.selection.test_subtype})` : ""}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(new Date(booking.start_date_time), "MMM d")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {format(new Date(booking.start_date_time), "HH:mm")}
              </span>
            </div>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isAccepting || isRejecting}>
              Review
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Booking request</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm">
                  <div className="font-medium">Student</div>
                  <div className="text-muted-foreground">{booking.student?.name} — {booking.student?.email}</div>
                </div>
                {booking.selection ? (
                  <div className="text-sm mt-3">
                    <div className="font-medium">Test</div>
                    <div className="text-muted-foreground">
                      {booking.selection.test_category.replace("_", " ")}
                      {booking.selection.test_subtype ? ` (${booking.selection.test_subtype})` : ""}
                      {" — "}{format(new Date(booking.start_date_time), "PPpp")}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium mb-2">Receipt</div>
                {!receiptPath ? (
                  <div className="text-sm text-muted-foreground">No receipt uploaded.</div>
                ) : loadingReceipt ? (
                  <div className="text-sm text-muted-foreground">Loading receipt…</div>
                ) : signedUrl ? (
                  <>
                    {isImage ? (
                      <img
                        src={signedUrl}
                        alt="Booking receipt"
                        className="max-h-[420px] w-full rounded-md object-contain bg-muted"
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-muted-foreground">
                          {booking.receipt_original_name || "Receipt"}{isPdf ? " (PDF)" : ""}
                        </div>
                        <a href={signedUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline">Open</Button>
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Could not load receipt.</div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  onReject();
                  setOpen(false);
                }}
                disabled={isAccepting || isRejecting}
              >
                {isRejecting ? "Declining..." : "Decline"}
              </Button>
              <Button
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => {
                  onAccept();
                  setOpen(false);
                }}
                disabled={isAccepting || isRejecting}
              >
                {isAccepting ? "Accepting..." : "Accept"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default TeacherDashboard;
