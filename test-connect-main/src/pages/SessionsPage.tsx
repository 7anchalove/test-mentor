import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Clock, Link as LinkIcon, CheckCircle2 } from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type SessionRow = {
  id: string;
  booking_id: string;
  conversation_id: string | null;
  student_id: string;
  teacher_id: string;
  start_date_time: string;
  end_date_time: string;
  meeting_link: string | null;
  status: "scheduled" | "completed" | "cancelled";
  student?: { name: string | null } | null;
  teacher?: { name: string | null } | null;
};

const SessionsPage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  const [meetingLinkDraft, setMeetingLinkDraft] = useState<string>("");

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions", user?.id, profile?.role],
    queryFn: async (): Promise<SessionRow[]> => {
      if (!user || !profile?.role) return [];

      const base = supabase
        .from("sessions")
        .select("*")
        .order("start_date_time", { ascending: true });

      const { data, error } =
        profile.role === "teacher"
          ? await base.eq("teacher_id", user.id)
          : await base.eq("student_id", user.id);

      if (error) throw error;
      if (!data?.length) return [];

      // Enrich with names
      const studentIds = [...new Set(data.map((s) => s.student_id))];
      const teacherIds = [...new Set(data.map((s) => s.teacher_id))];

      const [{ data: students }, { data: teachers }] = await Promise.all([
        supabase.from("profiles").select("user_id, name").in("user_id", studentIds),
        supabase.from("profiles").select("user_id, name").in("user_id", teacherIds),
      ]);

      return (data as any[]).map((s) => ({
        ...(s as any),
        student: students?.find((p) => p.user_id === s.student_id) ?? null,
        teacher: teachers?.find((p) => p.user_id === s.teacher_id) ?? null,
      }));
    },
    enabled: !!user && !!profile?.role,
  });

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const list = sessions ?? [];
    return {
      upcoming: list.filter((s) => new Date(s.start_date_time) >= now && s.status !== "cancelled"),
      past: list.filter((s) => new Date(s.start_date_time) < now && s.status !== "cancelled"),
    };
  }, [sessions]);

  const updateMeetingLink = useMutation({
    mutationFn: async () => {
      if (!editSessionId) throw new Error("No session selected");
      const { error } = await supabase
        .from("sessions")
        .update({ meeting_link: meetingLinkDraft || null })
        .eq("id", editSessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Meeting link saved" });
      setEditSessionId(null);
      setMeetingLinkDraft("");
      queryClient.invalidateQueries({ queryKey: ["sessions", user?.id, profile?.role] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save link",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const markCompleted = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Session marked as completed" });
      queryClient.invalidateQueries({ queryKey: ["sessions", user?.id, profile?.role] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not update session",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const SessionCard = ({ s }: { s: SessionRow }) => {
    const otherName =
      profile?.role === "teacher" ? s.student?.name ?? "Student" : s.teacher?.name ?? "Teacher";
    const start = new Date(s.start_date_time);
    const end = new Date(s.end_date_time);

    return (
      <Card className="transition-all hover:shadow-md">
        <CardContent className="p-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold font-display">{otherName}</h3>
              <Badge variant={s.status === "completed" ? "secondary" : "default"}>
                {s.status}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(start, "MMM d, yyyy")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {format(start, "HH:mm")}–{format(end, "HH:mm")}
              </span>
            </div>

            {s.meeting_link ? (
              <a
                className="mt-3 inline-flex items-center gap-2 text-sm text-primary underline"
                href={s.meeting_link}
                target="_blank"
                rel="noreferrer"
              >
                <LinkIcon className="h-4 w-4" /> Join meeting
              </a>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Meeting link not set yet.
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {profile?.role === "teacher" && (
              <Dialog
                open={editSessionId === s.id}
                onOpenChange={(open) => {
                  if (open) {
                    setEditSessionId(s.id);
                    setMeetingLinkDraft(s.meeting_link ?? "");
                  } else {
                    setEditSessionId(null);
                    setMeetingLinkDraft("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">{s.meeting_link ? "Edit link" : "Add link"}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Meeting link</DialogTitle>
                  </DialogHeader>
                  <Input
                    placeholder="Paste Google Meet / Zoom link"
                    value={meetingLinkDraft}
                    onChange={(e) => setMeetingLinkDraft(e.target.value)}
                  />
                  <DialogFooter>
                    <Button
                      onClick={() => updateMeetingLink.mutate()}
                      disabled={updateMeetingLink.isPending}
                    >
                      {updateMeetingLink.isPending ? "Saving..." : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {profile?.role === "teacher" && s.status !== "completed" && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-2"
                onClick={() => markCompleted.mutate(s.id)}
                disabled={markCompleted.isPending}
              >
                <CheckCircle2 className="h-4 w-4" /> Mark done
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Sessions</h1>
          <p className="mt-2 text-muted-foreground">Your scheduled appointments</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !sessions?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>No sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold font-display mb-4">Upcoming</h2>
                <div className="space-y-3">
                  {upcoming.map((s) => (
                    <SessionCard key={s.id} s={s} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold font-display mb-4">Past</h2>
                <div className="space-y-3">
                  {past.map((s) => (
                    <SessionCard key={s.id} s={s} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default SessionsPage;
