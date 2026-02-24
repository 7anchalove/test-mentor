import { useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import AppLayout from "@/components/layout/AppLayout";
import DashboardHeader from "@/components/teacher/dashboard/DashboardHeader";
import StatsCards from "@/components/teacher/dashboard/StatsCards";
import DashboardView from "@/components/teacher/dashboard/DashboardView";
import type { DashboardBooking } from "@/components/teacher/dashboard/BookingCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  BOOKING_STATUS,
  assertBookingStatus,
} from "@/lib/bookingStatus";
import {
  COMPLETED_BOOKING_STATUS,
  DEFAULT_DASHBOARD_VIEW,
  isCompletedBooking,
  isRequestStatus,
  isUpcomingBooking,
  parseDashboardView,
  type DashboardView,
} from "@/lib/teacherDashboard";

type DashboardStats = {
  upcoming: number;
  completed: number;
  total: number;
};

async function enrichBookingsRows(rows: any[]): Promise<DashboardBooking[]> {
  if (!rows.length) return [];

  const studentIds = [...new Set(rows.map((booking) => booking.student_id))];
  const selectionIds = rows.map((booking) => booking.student_test_selection_id);
  const bookingIds = rows.map((booking) => booking.id);

  const [{ data: profiles }, { data: selections }, { data: conversations }] = await Promise.all([
    supabase.from("profiles").select("user_id, name, email").in("user_id", studentIds),
    supabase.from("student_test_selections").select("*").in("id", selectionIds),
    supabase.from("conversations").select("id, booking_id").in("booking_id", bookingIds),
  ]);

  return rows.map((booking) => ({
    ...booking,
    student: profiles?.find((profile) => profile.user_id === booking.student_id) ?? null,
    selection: selections?.find((selection) => selection.id === booking.student_test_selection_id) ?? null,
    conversationId: conversations?.find((conversation) => conversation.booking_id === booking.id)?.id,
  }));
}

const TeacherDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const view = parseDashboardView(searchParams.get("view"));

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
          if (!row?.status || !isRequestStatus(row.status)) return;

          toast({
            title: "New booking request",
            description: "Open Requests to review it.",
          });

          queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-bookings", user.id] });
          queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-requests", user.id] });
          queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-stats", user.id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, toast, user]);

  const { data: stats = { upcoming: 0, completed: 0, total: 0 } as DashboardStats } = useQuery({
    queryKey: ["teacher-dashboard-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { upcoming: 0, completed: 0, total: 0 };

      const { data, error } = await supabase
        .from("bookings")
        .select("id, status, start_date_time")
        .eq("teacher_id", user.id)
        .eq("archived_by_teacher", false);

      if (error) throw error;
      const rows = data ?? [];
      const now = new Date();

      return {
        upcoming: rows.filter((booking) => isUpcomingBooking(booking, now)).length,
        completed: rows.filter((booking) => isCompletedBooking(booking)).length,
        total: rows.length,
      };
    },
  });

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["teacher-dashboard-bookings", user?.id, view],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from("bookings")
        .select("*")
        .eq("teacher_id", user.id)
        .eq("archived_by_teacher", false)
        .order("start_date_time", { ascending: true });

      if (view === "upcoming") {
        query = query
          .in("status", [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] as any)
          .gt("start_date_time", new Date().toISOString());
      }

      if (view === "completed") {
        query = query.eq("status", COMPLETED_BOOKING_STATUS as any);
      }

      const { data, error } = await query;
      if (error) throw error;

      return enrichBookingsRows(data ?? []);
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["teacher-dashboard-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("teacher_id", user.id)
        .eq("archived_by_teacher", false)
        .in("status", [BOOKING_STATUS.PENDING_REVIEW, BOOKING_STATUS.AWAITING_RECEIPT] as any)
        .order("start_date_time", { ascending: true });

      if (error) throw error;
      return enrichBookingsRows(data ?? []);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (booking: DashboardBooking) => {
      const { data: conversationId, error: conversationError } = await supabase.rpc("ensure_conversation_for_booking", {
        p_booking_id: booking.id,
      });

      if (conversationError || !conversationId) {
        throw conversationError ?? new Error("Could not create conversation");
      }

      const start = new Date(booking.start_date_time);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 60);

      const { error: sessionError } = await supabase
        .from("sessions")
        .upsert(
          {
            booking_id: booking.id,
            conversation_id: conversationId,
            student_id: (booking as any).student_id,
            teacher_id: (booking as any).teacher_id,
            start_date_time: booking.start_date_time,
            end_date_time: end.toISOString(),
            status: "scheduled",
          },
          { onConflict: "booking_id" },
        );

      if (sessionError) throw sessionError;

      const nextStatus = assertBookingStatus(
        BOOKING_STATUS.CONFIRMED,
        "TeacherDashboard.acceptMutation.update(bookings)",
      );

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: nextStatus })
        .eq("id", booking.id)
        .eq("teacher_id", user?.id);

      if (updateError) throw updateError;

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
      }
    },
    onSuccess: () => {
      toast({ title: "Request accepted", description: "Booking confirmed and session created." });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-bookings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-requests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-stats", user?.id] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not accept request",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (booking: DashboardBooking) => {
      const nextStatus = assertBookingStatus(
        BOOKING_STATUS.DECLINED,
        "TeacherDashboard.rejectMutation.update(bookings)",
      );

      const { error } = await supabase
        .from("bookings")
        .update({ status: nextStatus } as any)
        .eq("id", booking.id)
        .eq("teacher_id", user?.id);

      if (error) throw error;

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
      }
    },
    onSuccess: () => {
      toast({ title: "Request declined" });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-bookings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-requests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-stats", user?.id] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not decline request",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (booking: DashboardBooking) => {
      const { error } = await supabase
        .from("bookings")
        .update({ archived_by_teacher: true } as any)
        .eq("id", booking.id)
        .eq("teacher_id", user?.id);

      if (error) throw error;
      return booking;
    },
    onMutate: async (booking) => {
      queryClient.setQueriesData({ queryKey: ["teacher-dashboard-bookings", user?.id] }, (old: any) =>
        Array.isArray(old) ? old.filter((item) => item.id !== booking.id) : old,
      );
      queryClient.setQueryData(["teacher-dashboard-requests", user?.id], (old: any) =>
        Array.isArray(old) ? old.filter((item) => item.id !== booking.id) : old,
      );
      queryClient.setQueryData(["teacher-dashboard-stats", user?.id], (old: DashboardStats | undefined) => {
        if (!old) return old;
        return {
          upcoming: Math.max(0, old.upcoming - (isUpcomingBooking(booking, new Date()) ? 1 : 0)),
          completed: Math.max(0, old.completed - (isCompletedBooking(booking) ? 1 : 0)),
          total: Math.max(0, old.total - 1),
        };
      });
    },
    onSuccess: () => {
      toast({ title: "Booking archived" });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-bookings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-requests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-stats", user?.id] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not archive booking",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-bookings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-requests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-stats", user?.id] });
    },
  });

  const { upcoming, completed, past } = useMemo(() => {
    const now = new Date();

    const upcomingRows = bookings.filter((booking) => isUpcomingBooking(booking, now));
    const completedRows = bookings.filter((booking) => isCompletedBooking(booking));
    const pastRows = bookings.filter(
      (booking) =>
        !isRequestStatus(booking.status) &&
        !isUpcomingBooking(booking, now) &&
        !isCompletedBooking(booking),
    );

    return {
      upcoming: upcomingRows,
      completed: completedRows,
      past: pastRows,
    };
  }, [bookings]);

  const handleChangeView = (nextView: DashboardView) => {
    setSearchParams(nextView === DEFAULT_DASHBOARD_VIEW ? {} : { view: nextView });
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl">
        <DashboardHeader />

        <StatsCards
          activeView={view}
          stats={stats}
          onChangeView={handleChangeView}
        />

        <DashboardView
          view={view}
          isLoading={isLoading}
          requests={requests}
          upcoming={upcoming}
          completed={completed}
          past={past}
          allCount={stats.total}
          onAcceptRequest={(booking) => acceptMutation.mutate(booking)}
          onRejectRequest={(booking) => rejectMutation.mutate(booking)}
          requestLoading={{
            acceptBookingId: (acceptMutation.variables as DashboardBooking | undefined)?.id,
            rejectBookingId: (rejectMutation.variables as DashboardBooking | undefined)?.id,
          }}
          onArchive={(booking) => archiveMutation.mutate(booking)}
          archiveBookingId={(archiveMutation.variables as DashboardBooking | undefined)?.id}
          onChat={(conversationId) => navigate(`/chat/${conversationId}`)}
        />
      </div>
    </AppLayout>
  );
};

export default TeacherDashboard;
