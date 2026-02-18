import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarIcon, Clock, BookOpen, User, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";

const PendingRequestsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const handledBookingsRef = useRef<Set<string>>(new Set());

  const { data: requests, isLoading } = useQuery({
    queryKey: ["student-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("student_id", user.id)
        .order("start_date_time", { ascending: true });

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

          if (updated.status === "cancelled") {
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
          <h1 className="text-3xl font-bold font-display">Requests</h1>
          <p className="mt-2 text-muted-foreground">
            Track the status of your booking requests.
          </p>
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

                  <Badge variant="secondary" className="uppercase">
                    {req.status}
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

