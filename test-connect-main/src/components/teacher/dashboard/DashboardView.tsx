import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { BookOpen, CalendarIcon, Clock, User } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardView as DashboardViewKey } from "@/lib/teacherDashboard";
import { canArchiveBooking } from "@/lib/teacherDashboard";
import BookingCard, { type DashboardBooking } from "@/components/teacher/dashboard/BookingCard";

type DashboardViewProps = {
  view: DashboardViewKey;
  isLoading: boolean;
  requests: DashboardBooking[];
  upcoming: DashboardBooking[];
  completed: DashboardBooking[];
  past: DashboardBooking[];
  allCount: number;
  onAcceptRequest: (booking: DashboardBooking) => void;
  onRejectRequest: (booking: DashboardBooking) => void;
  requestLoading: {
    acceptBookingId?: string;
    rejectBookingId?: string;
  };
  onChat: (conversationId: string) => void;
  onArchive: (booking: DashboardBooking) => void;
  archiveBookingId?: string;
};

const SectionEmpty: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{message}</div>
);

const DashboardView: React.FC<DashboardViewProps> = ({
  view,
  isLoading,
  requests,
  upcoming,
  completed,
  past,
  allCount,
  onAcceptRequest,
  onRejectRequest,
  requestLoading,
  onChat,
  onArchive,
  archiveBookingId,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const upcomingRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = view === "upcoming" ? upcomingRef.current : view === "completed" ? completedRef.current : rootRef.current;
    if (!target) return;

    const timeout = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [view, allCount]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (allCount === 0) {
    return (
      <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
        <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-40" />
        <p>No bookings yet. Students will find you soon.</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-8">
      {(view === "all" || view === "upcoming") && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold font-display">Requests</h2>
            <Badge variant="outline">{requests.length}</Badge>
          </div>
          {requests.length === 0 ? (
            <SectionEmpty message="No pending requests right now." />
          ) : (
            <div className="space-y-3">
              {requests.map((booking) => (
                <RequestCard
                  key={booking.id}
                  booking={booking}
                  onAccept={() => onAcceptRequest(booking)}
                  onReject={() => onRejectRequest(booking)}
                  isAccepting={requestLoading.acceptBookingId === booking.id}
                  isRejecting={requestLoading.rejectBookingId === booking.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {(view === "all" || view === "upcoming") && (
        <div ref={upcomingRef}>
          <h2 className="mb-4 text-xl font-semibold font-display">Upcoming Sessions</h2>
          {upcoming.length === 0 ? (
            <SectionEmpty message="No upcoming bookings for the current filter." />
          ) : (
            <div className="space-y-3">
              {upcoming.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  canArchive={canArchiveBooking(booking.status)}
                  isArchiving={archiveBookingId === booking.id}
                  onArchive={onArchive}
                  onChat={onChat}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {(view === "all" || view === "completed") && (
        <div ref={completedRef}>
          <h2 className="mb-4 text-xl font-semibold font-display">Completed</h2>
          {completed.length === 0 ? (
            <SectionEmpty message="No completed bookings yet." />
          ) : (
            <div className="space-y-3">
              {completed.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  canArchive={canArchiveBooking(booking.status)}
                  isArchiving={archiveBookingId === booking.id}
                  onArchive={onArchive}
                  onChat={onChat}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {view === "all" && (
        <div>
          <h2 className="mb-4 text-xl font-semibold font-display">Past</h2>
          {past.length === 0 ? (
            <SectionEmpty message="No past bookings found." />
          ) : (
            <div className="space-y-3">
              {past.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  canArchive={canArchiveBooking(booking.status)}
                  isArchiving={archiveBookingId === booking.id}
                  onArchive={onArchive}
                  onChat={onChat}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type RequestCardProps = {
  booking: DashboardBooking;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
  isRejecting: boolean;
};

const RequestCard: React.FC<RequestCardProps> = ({ booking, onAccept, onReject, isAccepting, isRejecting }) => {
  const [open, setOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const receiptPath = (booking as any)?.receipt_path as string | undefined;
  const receiptMime = ((booking as any)?.receipt_mime as string | undefined) ?? "";

  const isImage = useMemo(() => receiptMime.startsWith("image/"), [receiptMime]);
  const isPdf = useMemo(() => receiptMime === "application/pdf", [receiptMime]);

  useEffect(() => {
    let alive = true;

    async function loadReceipt() {
      if (!open || !receiptPath) return;
      setLoadingReceipt(true);
      const { data, error } = await supabase.storage.from("booking-receipts").createSignedUrl(receiptPath, 60 * 60);
      if (!alive) return;

      setLoadingReceipt(false);
      if (error) {
        setSignedUrl(null);
        return;
      }
      setSignedUrl(data?.signedUrl ?? null);
    }

    loadReceipt();

    return () => {
      alive = false;
    };
  }, [open, receiptPath]);

  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
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

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isAccepting || isRejecting}>Review</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Booking request</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm">
                  <div className="font-medium">Student</div>
                  <div className="text-muted-foreground">{booking.student?.name} — {booking.student?.email}</div>
                </div>
                {booking.selection ? (
                  <div className="mt-3 text-sm">
                    <div className="font-medium">Test</div>
                    <div className="text-muted-foreground">
                      {booking.selection.test_category.replace("_", " ")}
                      {booking.selection.test_subtype ? ` (${booking.selection.test_subtype})` : ""}
                      {" — "}
                      {format(new Date(booking.start_date_time), "PPpp")}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-2 text-sm font-medium">Receipt</div>
                {!receiptPath ? (
                  <div className="text-sm text-muted-foreground">No receipt uploaded.</div>
                ) : loadingReceipt ? (
                  <div className="text-sm text-muted-foreground">Loading receipt…</div>
                ) : signedUrl ? (
                  isImage ? (
                    <img src={signedUrl} alt="Booking receipt" className="max-h-[420px] w-full rounded-md bg-muted object-contain" />
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        {(booking as any).receipt_original_name || "Receipt"}
                        {isPdf ? " (PDF)" : ""}
                      </div>
                      <a href={signedUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline">Open</Button>
                      </a>
                    </div>
                  )
                ) : (
                  <div className="text-sm text-muted-foreground">Could not load receipt.</div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  onReject();
                  setOpen(false);
                }}
                disabled={isAccepting || isRejecting}
              >
                {isRejecting ? "Declining..." : "Decline"}
              </Button>
              <Button
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => {
                  onAccept();
                  setOpen(false);
                }}
                disabled={isAccepting || isRejecting}
              >
                {isAccepting ? "Accepting..." : "Accept"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default DashboardView;
