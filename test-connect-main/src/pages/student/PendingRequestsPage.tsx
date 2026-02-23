import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft, CalendarIcon, Clock, BookOpen, User, MessageSquare, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";

type RequestStatus = "awaiting_receipt" | "pending_review" | "pending" | "confirmed" | "declined" | "cancelled";

function getStatusUi(status: string | null | undefined): { label: string; className: string } {
  const normalized = String(status ?? "").toLowerCase() as RequestStatus;

  if (normalized === "awaiting_receipt" || normalized === "pending_review" || normalized === "pending") {
    return {
      label: "Pending",
      className: "bg-amber-500 text-white border-transparent",
    };
  }

  if (normalized === "confirmed") {
    return {
      label: "Confirmed",
      className: "bg-success text-success-foreground border-transparent",
    };
  }

  if (normalized === "declined") {
    return {
      label: "Declined",
      className: "bg-destructive text-destructive-foreground border-transparent",
    };
  }

  if (normalized === "cancelled") {
    return {
      label: "Cancelled",
      className: "bg-destructive text-destructive-foreground border-transparent",
    };
  }

  return {
    label: "Pending",
    className: "bg-amber-500 text-white border-transparent",
  };
}

function canDeleteRequest(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "declined" || normalized === "cancelled";
}

const PendingRequestsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const handledBookingsRef = useRef<Set<string>>(new Set());
  const requestsQueryKey = ["student-requests", user?.id];

  const { data: requests, isLoading } = useQuery({
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

      // Get conversations (only for confirmed bookings)
      const bookingIds = data.map((b) => b.id);
      const { data: convos } = await supabase
        .from("conversations")
        .select("id, booking_id")
        .in("booking_id", bookingIds);

      return data.map((b) => ({
        ...b,
        teacher: teacherProfiles?.find((p) => p.user_id === b.teacher_id),
        selection: selections?.find((s) => s.id === b.student_test_selection_id),
        conversationId: convos?.find((c) => c.booking_id === b.id)?.id,
      }));
    },
    enabled: !!user,
    onError: (err: any) => {
      toast({
        title: "Could not load pending requests",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

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
        .in("status", ["declined", "cancelled"]);

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

  const oldRequests = (requests ?? []).filter((request) => canDeleteRequest(request.status));

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

          if (updated.status === "confirmed") {
            // Find conversation created for this booking
            const { data: convo, error } = await supabase
              .from("conversations")
              .select("id")
              .eq("booking_id", bookingId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (error || !convo) return;

            toast({ title: "Teacher accepted — chat is now available" });
            navigate(`/chat/${convo.id}`);
          }

          if (updated.status === "declined" || updated.status === "cancelled") {
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
          <div className="text-center py-16 text-muted-foreground">
            <User className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No requests yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id} className="transition-all hover:shadow-md">
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

                    {req.status === "confirmed" && req.conversationId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => navigate(`/chat/${req.conversationId}`)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Chat
                      </Button>
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

