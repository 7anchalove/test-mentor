import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
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
import { MessageSquare, User, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";

type ConversationListItem = {
  id: string;
  booking_id: string | null;
  student_id: string;
  teacher_id: string;
  updated_at: string;
  otherProfile?: { user_id: string; name: string; role: string } | null;
  bookingSummary?: {
    test_category: string;
    test_subtype: string | null;
    start_date_time: string;
  } | null;
};

const ConversationsPage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["conversations", user?.id];

  const { data: conversations, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("conversation_participants")
        .select("conversation_id, conversations(*)")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (error) throw error;
      if (!data?.length) return [];

      const rows = data as Array<{ conversation_id: string; conversations: any }>;
      const convoRows = rows
        .map((row) => row.conversations)
        .filter(Boolean)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      // Get all other user IDs
      const otherIds = convoRows.map((c) =>
        c.student_id === user.id ? c.teacher_id : c.student_id
      );

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, role")
        .in("user_id", otherIds);

      // Get booking info
      const bookingIds = convoRows.filter((c) => c.booking_id).map((c) => c.booking_id!);
      const bookingMap = new Map();
      if (bookingIds.length) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select(
            "id, start_date_time, test_category, student_test_selections!bookings_student_test_selection_id_fkey(test_category, test_subtype)"
          )
          .in("id", bookingIds);

        if (bookings?.length) {
          bookings.forEach((b) => {
            const rawSelection = (b as any).student_test_selections as
              | { test_category: string; test_subtype: string | null }
              | { test_category: string; test_subtype: string | null }[]
              | null;
            const selection = Array.isArray(rawSelection) ? rawSelection[0] : rawSelection;
            const fallbackCategory = (b as any).test_category as string | null | undefined;

            bookingMap.set(b.id, {
              test_category: selection?.test_category ?? fallbackCategory ?? "Test",
              test_subtype: selection?.test_subtype ?? null,
              start_date_time: b.start_date_time,
            });
          });
        }
      }

      return convoRows.map((c) => ({
        ...c,
        otherProfile: profiles?.find(
          (p) => p.user_id === (c.student_id === user.id ? c.teacher_id : c.student_id)
        ),
        bookingSummary: c.booking_id ? bookingMap.get(c.booking_id) : null,
      })) as ConversationListItem[];
    },
    enabled: !!user,
  });

  const deleteOneMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc("delete_conversation_for_me", {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      return conversationId;
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ConversationListItem[]>(queryKey);
      queryClient.setQueryData<ConversationListItem[]>(queryKey, (old = []) =>
        old.filter((conversation) => conversation.id !== conversationId)
      );
      return { previous };
    },
    onError: (err: any, _conversationId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({
        title: "Could not delete conversation",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "Conversation deleted" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_all_conversations_for_me");
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ConversationListItem[]>(queryKey);
      queryClient.setQueryData<ConversationListItem[]>(queryKey, []);
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({
        title: "Could not delete all conversations",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "All conversations deleted" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold font-display">Messages</h1>
              <p className="mt-2 text-muted-foreground">Your conversations with {profile?.role === "teacher" ? "students" : "teachers"}</p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={!conversations?.length || deleteAllMutation.isPending}>
                  {deleteAllMutation.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                    </span>
                  ) : (
                    "Delete all"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all conversations?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will hide all conversations for your account. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteAllMutation.mutate()} disabled={deleteAllMutation.isPending}>
                    {deleteAllMutation.isPending ? "Deleting..." : "Confirm"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
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
                    {convo.bookingSummary && (
                      <p className="text-sm text-muted-foreground truncate">
                        {convo.bookingSummary.test_category.replace("_", " ")}
                        {convo.bookingSummary.test_subtype ? ` (${convo.bookingSummary.test_subtype})` : ""} •{" "}
                        {format(new Date(convo.bookingSummary.start_date_time), "MMM d, HH:mm")}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(convo.updated_at), "MMM d")}
                  </span>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-destructive hover:text-destructive"
                        disabled={deleteOneMutation.isPending || deleteAllMutation.isPending}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {deleteOneMutation.isPending && deleteOneMutation.variables === convo.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(event) => event.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will hide it for you only. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteOneMutation.mutate(convo.id)}
                          disabled={deleteOneMutation.isPending}
                        >
                          {deleteOneMutation.isPending && deleteOneMutation.variables === convo.id ? "Deleting..." : "Confirm"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
