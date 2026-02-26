import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type NotificationItem = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  booking_id?: string | null;
  type?: string | null;
  kind?: string | null;
  data?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

const MAX_NOTIFICATIONS = 20;
const BOOKING_DECISION_KEYWORDS = ["accepted", "confirmed", "declined", "cancelled"] as const;

function isBookingDecisionNotification(notification: NotificationItem) {
  const haystack = [
    notification.kind,
    notification.type,
    notification.title,
    notification.body,
    notification.action_url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return BOOKING_DECISION_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

const NotificationsBell = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user?.id) {
        console.warn("[NotificationsBell] Missing session user. Skipping notifications query.");
        setNotifications([]);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(MAX_NOTIFICATIONS);

      if (error) {
        console.error("[NotificationsBell] Failed to load notifications", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setLoading(false);
        return;
      }

      setNotifications((data ?? []) as NotificationItem[]);
      setLoading(false);
    };

    loadNotifications();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications-user-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const incoming = payload.new as NotificationItem;
          if (!incoming?.id) return;

          setNotifications((prev) => {
            if (prev.some((item) => item.id === incoming.id)) return prev;

            const next = [incoming, ...prev]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, MAX_NOTIFICATIONS);
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[NotificationsBell] Realtime channel error for notifications subscription", {
            userId: user.id,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel).catch((error) => {
        console.error("[NotificationsBell] Failed to remove notifications realtime channel", error);
      });
    };
  }, [user?.id]);

  const markAsRead = async (id: string) => {
    if (!user?.id) {
      console.warn("[NotificationsBell] Missing session while marking notification as read", { id });
      return;
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("[NotificationsBell] Failed to mark notification as read", {
        id,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return;
    }

    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
    );
  };

  const markAllAsRead = async () => {
    if (!user?.id) {
      console.warn("[NotificationsBell] Missing session while marking all notifications as read");
      return;
    }

    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("[NotificationsBell] Failed to mark all notifications as read", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return;
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.id) return;

    await markAsRead(notification.id);

    if (profile?.role === "student" && isBookingDecisionNotification(notification)) {
      navigate("/dashboard/requests");
      setOpen(false);
      return;
    }

    if (notification.action_url) {
      navigate(notification.action_url);
    }

    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Open notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="h-8 px-2 text-xs"
          >
            Mark all as read
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto p-1">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification)}
                className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${notification.is_read ? "font-normal" : "font-semibold"}`}>
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {!notification.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-primary" aria-hidden />}
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationsBell;