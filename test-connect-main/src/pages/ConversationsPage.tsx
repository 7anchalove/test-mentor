import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, User } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";

const ConversationsPage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .or(`student_id.eq.${user.id},teacher_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      if (!data?.length) return [];

      // Get all other user IDs
      const otherIds = data.map((c) =>
        c.student_id === user.id ? c.teacher_id : c.student_id
      );

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, role")
        .in("user_id", otherIds);

      // Get booking info
      const bookingIds = data.filter((c) => c.booking_id).map((c) => c.booking_id!);
      let bookingMap = new Map();
      if (bookingIds.length) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("id, student_test_selection_id")
          .in("id", bookingIds);

        if (bookings?.length) {
          const selIds = bookings.map((b) => b.student_test_selection_id);
          const { data: sels } = await supabase
            .from("student_test_selections")
            .select("id, test_category, test_subtype, test_date_time")
            .in("id", selIds);

          bookings.forEach((b) => {
            const sel = sels?.find((s) => s.id === b.student_test_selection_id);
            if (sel) bookingMap.set(b.id, sel);
          });
        }
      }

      return data.map((c) => ({
        ...c,
        otherProfile: profiles?.find(
          (p) => p.user_id === (c.student_id === user.id ? c.teacher_id : c.student_id)
        ),
        testSelection: c.booking_id ? bookingMap.get(c.booking_id) : null,
      }));
    },
    enabled: !!user,
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Messages</h1>
          <p className="mt-2 text-muted-foreground">Your conversations with {profile?.role === "teacher" ? "students" : "teachers"}</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !conversations?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((convo) => (
              <Card
                key={convo.id}
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20"
                onClick={() => navigate(`/chat/${convo.id}`)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold font-display truncate">
                      {convo.otherProfile?.name || "Unknown"}
                    </h3>
                    {convo.testSelection && (
                      <p className="text-sm text-muted-foreground truncate">
                        {convo.testSelection.test_category.replace("_", " ")}
                        {convo.testSelection.test_subtype ? ` (${convo.testSelection.test_subtype})` : ""} •{" "}
                        {format(new Date(convo.testSelection.test_date_time), "MMM d, HH:mm")}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(convo.updated_at), "MMM d")}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ConversationsPage;
