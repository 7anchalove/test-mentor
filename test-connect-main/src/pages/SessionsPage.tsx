import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Clock, Link as LinkIcon, CheckCircle2, Trash2 } from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import { isValidAbsoluteHttpUrl, normalizeMeetingUrl } from "@/lib/meetingUrl";

type SessionStatus = "scheduled" | "completed" | "cancelled" | "declined";

type SessionRow = {
  id: string;
  booking_id: string;
  conversation_id: string | null;
  student_id: string;
  teacher_id: string;
  start_date_time: string;
  end_date_time: string;
  meeting_link: string | null;
  status: SessionStatus;
  is_archived?: boolean;
  student?: { name: string | null } | null;
  teacher?: { name: string | null } | null;
};

type Scope = "upcoming" | "past";
type StatusFilter = "all" | "scheduled" | "completed" | "cancelled" | "declined";

const SessionsPage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  const [meetingLinkDraft, setMeetingLinkDraft] = useState<string>("");
  const [scope, setScope] = useState<Scope>("upcoming");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const sessionsQueryKey = ["sessions", user?.id, profile?.role];

  const { data: sessions, isLoading } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: async (): Promise<SessionRow[]> => {
      if (!user || !profile?.role) return [];

      const base = supabase
        .from("sessions")
        .select("*")
        .filter("is_archived", "eq", "false")
        .order("start_date_time", { ascending: true });

      const { data, error } =
        profile.role === "teacher"
          ? await base.eq("teacher_id", user.id)
          : await base.eq("student_id", user.id);

      if (error) throw error;
      if (!data?.length) return [];

      const studentIds = [...new Set(data.map((session) => session.student_id))];
      const teacherIds = [...new Set(data.map((session) => session.teacher_id))];

      const [{ data: students }, { data: teachers }] = await Promise.all([
        supabase.from("profiles").select("user_id, name").in("user_id", studentIds),
        supabase.from("profiles").select("user_id, name").in("user_id", teacherIds),
      ]);

      return (data as any[]).map((session) => ({
        ...(session as any),
        student: students?.find((profileRow) => profileRow.user_id === session.student_id) ?? null,
        teacher: teachers?.find((profileRow) => profileRow.user_id === session.teacher_id) ?? null,
      }));
    },
    enabled: !!user && !!profile?.role,
  });

  const splitSessions = useMemo(() => {
    const now = new Date();
    const list = sessions ?? [];
    const upcoming = list.filter((session) => new Date(session.start_date_time) >= now);
    const past = list.filter((session) => new Date(session.start_date_time) < now);
    return { upcoming, past };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const source = scope === "upcoming" ? splitSessions.upcoming : splitSessions.past;
    if (statusFilter === "all") return source;
    return source.filter((session) => String(session.status) === statusFilter);
  }, [scope, splitSessions, statusFilter]);

  const updateMeetingLink = useMutation({
    mutationFn: async () => {
      if (!editSessionId) throw new Error("No session selected");

      const normalized = normalizeMeetingUrl(meetingLinkDraft);
      if (normalized && !isValidAbsoluteHttpUrl(normalized)) {
        throw new Error("Invalid meeting link");
      }

      const { error } = await supabase
        .from("sessions")
        .update({ meeting_link: normalized || null })
        .eq("id", editSessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Meeting link saved" });
      setEditSessionId(null);
      setMeetingLinkDraft("");
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
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
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
    onError: (err: any) => {
      toast({
        title: "Could not update session",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const archiveSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({ is_archived: true } as any)
        .eq("id", sessionId);
      if (error) throw error;
      return sessionId;
    },
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: sessionsQueryKey });
      const previous = queryClient.getQueryData<SessionRow[]>(sessionsQueryKey);
      queryClient.setQueryData<SessionRow[]>(sessionsQueryKey, (old = []) =>
        old.filter((session) => session.id !== sessionId)
      );
      return { previous };
    },
    onError: (err: any, _sessionId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(sessionsQueryKey, context.previous);
      }
      toast({
        title: "Could not delete session",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "Session removed" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
  });

  const archivePastSessions = useMutation({
    mutationFn: async () => {
      const ids = splitSessions.past.map((session) => session.id);
      if (!ids.length) return 0;

      const { error } = await supabase
        .from("sessions")
        .update({ is_archived: true } as any)
        .in("id", ids);

      if (error) throw error;
      return ids.length;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: sessionsQueryKey });
      const previous = queryClient.getQueryData<SessionRow[]>(sessionsQueryKey);
      const pastIds = new Set(splitSessions.past.map((session) => session.id));
      queryClient.setQueryData<SessionRow[]>(sessionsQueryKey, (old = []) =>
        old.filter((session) => !pastIds.has(session.id))
      );
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(sessionsQueryKey, context.previous);
      }
      toast({
        title: "Could not delete past sessions",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (count) => {
      if (count > 0) {
        toast({ title: `${count} past session${count > 1 ? "s" : ""} removed` });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
  });

  const SessionCard = ({ session }: { session: SessionRow }) => {
    const otherName =
      profile?.role === "teacher"
        ? session.student?.name ?? "Student"
        : session.teacher?.name ?? "Teacher";

    const start = new Date(session.start_date_time);
    const end = new Date(session.end_date_time);
    const normalizedMeetingLink = normalizeMeetingUrl(session.meeting_link ?? "");
    const canJoinMeeting = normalizedMeetingLink && isValidAbsoluteHttpUrl(normalizedMeetingLink);

    return (
      <Card className="transition-all hover:shadow-md">
        <CardContent className="p-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold font-display">{otherName}</h3>
              <StatusBadge status={session.status} />
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

            {session.meeting_link ? (
              canJoinMeeting ? (
                <Button
                  type="button"
                  variant="link"
                  className="mt-3 inline-flex h-auto items-center gap-2 p-0 text-sm"
                  onClick={() => window.open(normalizedMeetingLink, "_blank", "noopener,noreferrer")}
                >
                  <LinkIcon className="h-4 w-4" /> Join meeting
                </Button>
              ) : (
                <p className="mt-3 text-sm text-destructive">Invalid meeting link</p>
              )
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Meeting link not set yet.</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {profile?.role === "teacher" && (
              <Dialog
                open={editSessionId === session.id}
                onOpenChange={(open) => {
                  if (open) {
                    setEditSessionId(session.id);
                    setMeetingLinkDraft(session.meeting_link ?? "");
                  } else {
                    setEditSessionId(null);
                    setMeetingLinkDraft("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    {session.meeting_link ? "Edit link" : "Add link"}
                  </Button>
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
                    <Button onClick={() => updateMeetingLink.mutate()} disabled={updateMeetingLink.isPending}>
                      {updateMeetingLink.isPending ? "Saving..." : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {profile?.role === "teacher" && session.status !== "completed" && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-2"
                onClick={() => markCompleted.mutate(session.id)}
                disabled={markCompleted.isPending}
              >
                <CheckCircle2 className="h-4 w-4" /> Mark done
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-2 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the session from your list. You can’t undo this action from the UI.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => archiveSession.mutate(session.id)}
                    disabled={archiveSession.isPending}
                  >
                    {archiveSession.isPending ? "Deleting..." : "Confirm"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    );
  };

  const hasPastSessions = splitSessions.past.length > 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display">Sessions</h1>
            <p className="mt-2 text-muted-foreground">Your scheduled appointments</p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={!hasPastSessions || archivePastSessions.isPending}>
                {archivePastSessions.isPending ? "Deleting..." : "Delete all past"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all past sessions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all past sessions from your list.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => archivePastSessions.mutate()} disabled={archivePastSessions.isPending}>
                  {archivePastSessions.isPending ? "Deleting..." : "Confirm"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !(sessions?.length ?? 0) ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">No sessions yet</p>
            <p className="mt-1 text-sm">Accepted requests will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Tabs value={scope} onValueChange={(value) => setScope(value as Scope)}>
                <TabsList>
                  <TabsTrigger value="upcoming">Upcoming ({splitSessions.upcoming.length})</TabsTrigger>
                  <TabsTrigger value="past">Past ({splitSessions.past.length})</TabsTrigger>
                </TabsList>
              </Tabs>

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="w-[210px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!filteredSessions.length ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                <p className="text-lg font-medium">No sessions in this view</p>
                <p className="mt-1 text-sm">Try changing scope or status filter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default SessionsPage;
