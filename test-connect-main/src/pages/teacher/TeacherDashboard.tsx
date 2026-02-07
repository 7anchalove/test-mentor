import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Clock, MessageSquare, User, BookOpen } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";

const TeacherDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  const upcoming = bookings?.filter((b) => new Date(b.start_date_time) >= new Date()) || [];
  const past = bookings?.filter((b) => new Date(b.start_date_time) < new Date()) || [];

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Your upcoming and past bookings</p>
        </div>

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

export default TeacherDashboard;
