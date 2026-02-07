import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, CalendarIcon, Clock, BookOpen } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";

const ChatPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversation with booking details
  const { data: conversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  // Fetch the other person's profile
  const otherUserId = conversation
    ? conversation.student_id === user?.id
      ? conversation.teacher_id
      : conversation.student_id
    : null;

  const { data: otherProfile } = useQuery({
    queryKey: ["profile", otherUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", otherUserId!)
        .single();
      return data;
    },
    enabled: !!otherUserId,
  });

  // Fetch booking details
  const { data: bookingDetails } = useQuery({
    queryKey: ["booking-details", conversation?.booking_id],
    queryFn: async () => {
      if (!conversation?.booking_id) return null;
      const { data: booking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", conversation.booking_id)
        .single();
      if (!booking) return null;

      const { data: selection } = await supabase
        .from("student_test_selections")
        .select("*")
        .eq("id", booking.student_test_selection_id)
        .single();

      return { booking, selection };
    },
    enabled: !!conversation?.booking_id,
  });

  // Fetch messages
  const { data: messages } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user || !conversationId) throw new Error("Missing context");
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        text: text.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMutation.mutate(message);
  };

  const selection = bookingDetails?.selection;

  return (
    <AppLayout>
      <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-3xl flex-col">
        {/* Header */}
        <div className="mb-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/conversations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-semibold font-display">{otherProfile?.name || "Loading..."}</h2>
            <p className="text-xs text-muted-foreground">{otherProfile?.role === "teacher" ? "Teacher" : "Student"}</p>
          </div>
        </div>

        {/* Test info card */}
        {selection && (
          <Card className="mb-4 border-primary/20 bg-accent/50">
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {selection.test_category.replace("_", " ")}
                  {selection.test_subtype ? ` (${selection.test_subtype})` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  {format(new Date(selection.test_date_time), "MMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  {format(new Date(selection.test_date_time), "HH:mm")}
                </span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {bookingDetails.booking.status}
              </Badge>
            </CardContent>
          </Card>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card p-4 space-y-3">
          {!messages?.length ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No messages yet. Say hello! 👋
            </p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {format(new Date(msg.created_at), "HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="mt-4 flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!message.trim() || sendMutation.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </AppLayout>
  );
};

export default ChatPage;
