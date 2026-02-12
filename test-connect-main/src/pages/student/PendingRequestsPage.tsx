import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarIcon,
  Clock,
  BookOpen,
  User,
  Loader2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";

const PendingRequestsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const handledBookingsRef = useRef<Set<string>>(new Set());
   const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["student-pending-requests", user?.id],
      });
      toast({
        title: "Demande annulée",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Impossible d'annuler la demande",
        description: err?.message ?? "Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const handleCancel = (bookingId: string) => {
    cancelMutation.mutate(bookingId);
  };

  const { data: requests, isLoading } = useQuery({
    queryKey: ["student-pending-requests", user?.id],
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

      const selectionIds = data.map((b) => b.student_test_selection_id);
      const { data: selections, error: selErr } = await supabase
        .from("student_test_selections")
        .select("id, test_category, test_subtype, test_date_time")
        .in("id", selectionIds);

      if (selErr) {
        throw selErr;
      }

      const teacherIds = [...new Set(data.map((b) => b.teacher_id))];
      const { data: teacherProfiles, error: teacherErr } = await supabase
        .from("profiles")
        .select("user_id, name, avatar_url")
        .in("user_id", teacherIds);

      if (teacherErr) {
        throw teacherErr;
      }

      const bookingIds = data.map((b) => b.id);
      const { data: convos, error: convoErr } = await supabase
        .from("conversations")
        .select("id, booking_id")
        .in("booking_id", bookingIds);

      if (convoErr) {
        throw convoErr;
      }

      return data.map((b) => ({
        ...b,
        teacher: teacherProfiles?.find((p) => p.user_id === b.teacher_id),
        selection: selections?.find((s) => s.id === b.student_test_selection_id),
        conversationId: convos?.find((c) => c.booking_id === b.id)?.id,
      }));
    },
    enabled: !!user,
    onError: (err: any) => {
      console.error(err);
      setErrorMessage(err?.message ?? "Impossible de charger vos demandes.");
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
          if (!updated || updated.status !== "confirmed") return;

          const bookingId = updated.id as string | undefined;
          if (!bookingId) return;

          if (handledBookingsRef.current.has(bookingId)) return;
          handledBookingsRef.current.add(bookingId);

          // Find conversation created for this booking
          const { data: convo, error } = await supabase
            .from("conversations")
            .select("id")
            .eq("booking_id", bookingId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error || !convo) return;

          // Refresh pending list and redirect to chat
          queryClient.invalidateQueries({
            queryKey: ["student-pending-requests", user.id],
          });

          toast({
            title: "Teacher accepted — starting session",
          });

          navigate(`/chat/${convo.id}`);
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
          <h1 className="text-3xl font-bold font-display">Mes réservations</h1>
          <p className="mt-2 text-muted-foreground">
            Suivez vos demandes de réservation et accédez à vos sessions confirmées.
          </p>
        </div>

        {errorMessage && (
          <ErrorToast message={errorMessage} onClose={() => setErrorMessage(null)} />
        )}

        {isLoading ? (
          <LoadingSpinner message="Chargement de vos demandes…" />
        ) : !requests?.length ? (
          <EmptyState
            title="Aucune demande pour l’instant"
            description="Vos futures réservations apparaîtront ici."
          />
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
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(req.created_at), "dd/MM/yyyy 'à' HH:mm")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      variant={req.status === "confirmed" ? "default" : "secondary"}
                      className="uppercase"
                    >
                      {req.status}
                    </Badge>
                    <div className="flex gap-2">
                      {req.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={cancelMutation.isPending}
                          onClick={() => handleCancel(req.id)}
                        >
                          Annuler
                        </Button>
                      )}
                      {req.status === "confirmed" && req.conversationId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => navigate(`/chat/${req.conversationId}`)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Ouvrir la conversation
                        </Button>
                      )}
                    </div>
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

const LoadingSpinner = ({ message }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
    <Loader2 className="mb-3 h-6 w-6 animate-spin" />
    <p className="text-sm">{message || "Chargement..."}</p>
  </div>
);

const EmptyState = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => (
  <div className="py-16 text-center text-muted-foreground">
    <User className="mx-auto mb-4 h-12 w-12 opacity-30" />
    <h2 className="mb-1 text-lg font-semibold font-display text-foreground">
      {title}
    </h2>
    {description && <p className="text-sm">{description}</p>}
  </div>
);

const ErrorToast = ({
  message,
  onClose,
}: {
  message: string;
  onClose?: () => void;
}) => (
  <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
    <div className="flex items-start gap-2">
      <AlertCircle className="mt-0.5 h-4 w-4" />
      <span>{message}</span>
    </div>
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        className="text-xs font-medium hover:underline"
      >
        Fermer
      </button>
    )}
  </div>
);

