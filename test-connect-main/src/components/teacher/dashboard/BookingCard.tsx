import { format } from "date-fns";
import { CalendarIcon, Clock, MessageSquare, User, BookOpen, Archive } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
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

export type DashboardBooking = {
  id: string;
  status: string;
  start_date_time: string;
  archived_by_teacher?: boolean | null;
  student?: { name: string; email: string } | null;
  selection?: { test_category: string; test_subtype: string | null; test_date_time: string } | null;
  conversationId?: string;
};

type BookingCardProps = {
  booking: DashboardBooking;
  canArchive: boolean;
  isArchiving: boolean;
  onArchive: (booking: DashboardBooking) => void;
  onChat: (conversationId: string) => void;
};

const BookingCard: React.FC<BookingCardProps> = ({ booking, canArchive, isArchiving, onArchive, onChat }) => {
  return (
    <Card className="group border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold font-display">{booking.student?.name || "Student"}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {booking.selection && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {booking.selection.test_category.replace("_", " ")}
                  {booking.selection.test_subtype ? ` (${booking.selection.test_subtype})` : ""}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(new Date(booking.start_date_time), "MMM d")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {format(new Date(booking.start_date_time), "HH:mm")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />

          {booking.conversationId && (
            <Button size="sm" variant="outline" onClick={() => onChat(booking.conversationId!)} className="gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> Chat
            </Button>
          )}

          {canArchive && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground hover:text-foreground" disabled={isArchiving}>
                  <Archive className="h-3.5 w-3.5" /> {isArchiving ? "Archiving..." : "Archive"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive booking?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the booking from your dashboard but keeps it in the system.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onArchive(booking)} disabled={isArchiving}>
                    {isArchiving ? "Archiving..." : "Archive"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default BookingCard;
