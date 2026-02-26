import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, CalendarIcon, Clock, BookOpen, User, Loader2, Trash2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { BOOKING_STATUS, type BookingStatus } from "@/lib/bookingStatus";
import { cancelBooking } from "@/lib/bookings";

type RequestStatus = BookingStatus;

function getStatusUi(status: string | null | undefined): { label: string; className: string } {
  const normalized = String(status ?? "").toLowerCase() as RequestStatus;

  if (normalized === BOOKING_STATUS.AWAITING_RECEIPT || normalized === BOOKING_STATUS.PENDING_REVIEW || normalized === BOOKING_STATUS.PENDING) {
    return {
      label: "Pending",
      className: "border-amber-300 bg-amber-50 text-amber-700",
    };
  }

  if (normalized === BOOKING_STATUS.CONFIRMED) {
    return {
      label: "Confirmed",
      className: "border-emerald-300 bg-emerald-50 text-emerald-700",
    };
  }

  if (normalized === BOOKING_STATUS.DECLINED) {
    return {
      label: "Declined",
      className: "border-red-300 bg-red-50 text-red-700",
    };
  }

  if (normalized === BOOKING_STATUS.CANCELLED) {
    return {
      label: "Cancelled",
      className: "border-red-300 bg-red-50 text-red-700",
    };
  }

  return {
    label: "Pending",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  };
}

function canDeleteRequest(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === BOOKING_STATUS.DECLINED || normalized === BOOKING_STATUS.CANCELLED;
}

function canCancelRequest(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === BOOKING_STATUS.PENDING || normalized === BOOKING_STATUS.CONFIRMED;
}

const PendingRequestsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const handledBookingsRef = useRef<Set<string>>(new Set());
  const previousRequestIdsRef = useRef<Set<string>>(new Set());
  const [highlightRequestIds, setHighlightRequestIds] = useState<Set<string>>(new Set());
  const [cancelDialogRequestId, setCancelDialogRequestId] = useState<string | null>(null);
  const [cancelReasonDraft, setCancelReasonDraft] = useState("");
  const requestsQueryKey = ["student-requests", user?.id];

  const { data: requests, isLoading, error: requestsError } = useQuery<any[]>({
    queryKey: requestsQueryKey,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }
      if (!data?.length) return [];

      const teacherIds = [...new Set(data.map((b) => b.teacher_id))];
      const { data: teacherProfiles, error: teacherErr } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", teacherIds);

      if (teacherErr) {
        throw teacherErr;
      }

      const selectionIds = data.map((b) => b.student_test_selection_id);
      const { data: selections, error: selErr } = await supabase
        .from("student_test_selections")
        .select("id, test_category, test_subtype, test_date_time")
        .in("id", selectionIds);

      if (selErr) {
        throw selErr;
      }

      return data.map((b) => ({
        ...b,
        teacher: teacherProfiles?.find((p) => p.user_id === b.teacher_id),
        selection: selections?.find((s) => s.id === b.student_test_selection_id),
      }));
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!requestsError) return;

    const err = requestsError as any;
    toast({
      title: "Could not load pending requests",
      description: err?.message ?? "Please try again.",
      variant: "destructive",
    });
  }, [requestsError, toast]);

  const deleteOneMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);

      if (error) throw error;
      return bookingId;
    },
    onMutate: async (bookingId) => {
      await queryClient.cancelQueries({ queryKey: requestsQueryKey });
      const previous = queryClient.getQueryData<any[]>(requestsQueryKey);
      queryClient.setQueryData<any[]>(requestsQueryKey, (old = []) =>
        old.filter((request) => request.id !== bookingId)
      );
      return { previous };
    },
    onError: (err: any, _bookingId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(requestsQueryKey, context.previous);
      }
      const isRls = err?.code === "42501" || String(err?.message ?? "").toLowerCase().includes("row-level security");
      toast({
        title: "Could not delete request",
        description: isRls
          ? "You can only delete your own declined or cancelled requests."
          : err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "Request deleted" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: requestsQueryKey });
    },
  });

  const deleteAllOldMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error, count } = await supabase
        .from("bookings")
        .delete({ count: "exact" })
        .eq("student_id", user.id)
        .in("status", [BOOKING_STATUS.DECLINED, BOOKING_STATUS.CANCELLED]);

      if (error) throw error;
      return count ?? 0;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: requestsQueryKey });
      const previous = queryClient.getQueryData<any[]>(requestsQueryKey);
      queryClient.setQueryData<any[]>(requestsQueryKey, (old = []) =>
        old.filter((request) => !canDeleteRequest(request.status))
      );
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(requestsQueryKey, context.previous);
      }
      const isRls = err?.code === "42501" || String(err?.message ?? "").toLowerCase().includes("row-level security");
      toast({
        title: "Could not delete old requests",
        description: isRls
          ? "You can only delete your own declined or cancelled requests."
          : err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (deletedCount) => {
      toast({
        title: deletedCount > 0 ? `${deletedCount} old request${deletedCount > 1 ? "s" : ""} deleted` : "No old requests to delete",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: requestsQueryKey });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: string; reason?: string }) => {
      await cancelBooking(bookingId, reason);
      return { bookingId };
    },
    onMutate: async ({ bookingId, reason }) => {
      await queryClient.cancelQueries({ queryKey: requestsQueryKey });
      const previous = queryClient.getQueryData<any[]>(requestsQueryKey);
      const normalizedReason = reason?.trim();

      queryClient.setQueryData<any[]>(requestsQueryKey, (old = []) =>
        old.map((request) =>
          request.id === bookingId
            ? {
                ...request,
                status: BOOKING_STATUS.CANCELLED,
                cancel_reason: normalizedReason || request.cancel_reason,
              }
            : request,
        ),
      );

      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(requestsQueryKey, context.previous);
      }

      toast({
        title: "Could not cancel booking",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "Booking cancelled" });
      setCancelDialogRequestId(null);
      setCancelReasonDraft("");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: requestsQueryKey });
    },
  });

  const oldRequests = (requests ?? []).filter((request) => canDeleteRequest(request.status));

  useEffect(() => {
    const rows = requests ?? [];
    const currentIds = new Set(rows.map((request) => request.id));
    const newIds = rows
      .map((request) => request.id)
      .filter((id) => !previousRequestIdsRef.current.has(id));

    previousRequestIdsRef.current = currentIds;
    if (!newIds.length) return;

    setHighlightRequestIds((prev) => {
      const next = new Set(prev);
      newIds.forEach((id) => next.add(id));
      return next;
    });

    const timeout = window.setTimeout(() => {
      setHighlightRequestIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [requests]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`student-booking-requests-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `student_id=eq.${user.id}`,
        },
        async (payload) => {
          const updated = payload.new as any;
          if (!updated) return;

          const bookingId = updated.id as string | undefined;
          if (!bookingId) return;

          if (handledBookingsRef.current.has(bookingId)) return;
          handledBookingsRef.current.add(bookingId);

          // Refresh requests list
          queryClient.invalidateQueries({ queryKey: ["student-requests", user.id] });

          if (updated.status === BOOKING_STATUS.CONFIRMED) {
            const { data: conversationId, error } = await supabase.rpc("ensure_conversation_for_booking", {
              p_booking_id: bookingId,
            });

            if (error || !conversationId) return;

            toast({ title: "Teacher confirmed — chat is now available" });
            navigate(`/chat/${conversationId}`);
          }

          if (updated.status === BOOKING_STATUS.DECLINED || updated.status === BOOKING_STATUS.CANCELLED) {
            toast({
              title: "Request declined",
              description: "The teacher declined your request. You can book another teacher/time.",
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, navigate, toast, queryClient]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold font-display">Requests</h1>
              <p className="mt-2 text-muted-foreground">
                Track the status of your booking requests.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={!oldRequests.length || deleteAllOldMutation.isPending}>
                  {deleteAllOldMutation.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                    </span>
                  ) : (
                    "Delete all old"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all old requests?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all declined and cancelled requests. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteAllOldMutation.mutate()} disabled={deleteAllOldMutation.isPending}>
                    {deleteAllOldMutation.isPending ? "Deleting..." : "Confirm"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !requests?.length ? (
          <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center text-muted-foreground">
            <Sparkles className="mx-auto mb-4 h-10 w-10 opacity-40" />
            <p className="font-medium">No requests yet.</p>
            <p className="mt-1 text-sm">Your booking requests will appear here once submitted.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <Card key={req.id} className={`border-border/80 shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-md ${highlightRequestIds.has(req.id) ? "border-primary/40 bg-primary/5" : ""}`}>
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold font-display">
                        {req.teacher?.name || "Teacher"}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {req.selection && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" />
                            {req.selection.test_category.replace("_", " ")}
                            {req.selection.test_subtype
                              ? ` (${req.selection.test_subtype})`
                              : ""}
                          </span>
                        )}
                        {req.selection && (
                          <>
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              {format(new Date(req.selection.test_date_time), "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {format(new Date(req.selection.test_date_time), "HH:mm")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`uppercase ${getStatusUi(req.status).className}`}>
                      {getStatusUi(req.status).label}
                    </Badge>

                    {canCancelRequest(req.status) && (
                      <Dialog
                        open={cancelDialogRequestId === req.id}
                        onOpenChange={(open) => {
                          if (open) {
                            setCancelDialogRequestId(req.id);
                            setCancelReasonDraft("");
                          } else if (!cancelMutation.isPending) {
                            setCancelDialogRequestId(null);
                            setCancelReasonDraft("");
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={cancelMutation.isPending || deleteAllOldMutation.isPending}
                          >
                            Cancel booking
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Cancel this session?</DialogTitle>
                            <DialogDescription>
                              You can request another teacher after cancelling.
                            </DialogDescription>
                          </DialogHeader>
                          <Textarea
                            placeholder="Optional reason"
                            value={cancelReasonDraft}
                            onChange={(e) => setCancelReasonDraft(e.target.value)}
                            disabled={cancelMutation.isPending}
                          />
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (!cancelMutation.isPending) {
                                  setCancelDialogRequestId(null);
                                  setCancelReasonDraft("");
                                }
                              }}
                              disabled={cancelMutation.isPending}
                            >
                              Keep booking
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={() => cancelMutation.mutate({ bookingId: req.id, reason: cancelReasonDraft })}
                              disabled={cancelMutation.isPending}
                            >
                              {cancelMutation.isPending && cancelMutation.variables?.bookingId === req.id ? "Cancelling..." : "Cancel booking"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}

                    {canDeleteRequest(req.status) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-destructive hover:text-destructive"
                            disabled={deleteOneMutation.isPending || deleteAllOldMutation.isPending}
                          >
                            {deleteOneMutation.isPending && deleteOneMutation.variables === req.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this request?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteOneMutation.mutate(req.id)}
                              disabled={deleteOneMutation.isPending}
                            >
                              {deleteOneMutation.isPending && deleteOneMutation.variables === req.id ? "Deleting..." : "Confirm"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default PendingRequestsPage;

