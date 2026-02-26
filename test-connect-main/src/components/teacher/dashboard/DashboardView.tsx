import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { BookOpen, CalendarIcon, Clock, Inbox, Sparkles, User } from "lucide-react";

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
  <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 py-8 text-center text-sm text-muted-foreground">
    <Inbox className="mx-auto mb-2 h-5 w-5 opacity-50" />
    <p>{message}</p>
  </div>
);

const SectionCard: React.FC<{ title: string; count: number; children: React.ReactNode; id?: string; sectionRef?: React.RefObject<HTMLDivElement | null> }> = ({
  title,
  count,
  children,
  id,
  sectionRef,
}) => (
  <Card id={id} ref={sectionRef} className="border-border/70 shadow-sm">
    <CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs">
          {count}
        </Badge>
      </div>
      {children}
    </CardContent>
  </Card>
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
  const previousRequestIdsRef = useRef<Set<string>>(new Set());
  const [highlightRequestIds, setHighlightRequestIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(requests.map((request) => request.id));
    const newIds = requests
      .map((request) => request.id)
      .filter((id) => !previousRequestIdsRef.current.has(id));

    previousRequestIdsRef.current = currentIds;
    if (!newIds.length) return;

    setHighlightRequestIds((prev) => {
      const next = new Set(prev);
      newIds.forEach((id) => next.add(id));
      return next;
    });

    const timeout = window.setTimeout(() => {
      setHighlightRequestIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [requests]);

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
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (allCount === 0) {
    return (
      <div id="dashboard-root" className="rounded-xl border border-dashed border-border/70 bg-muted/20 py-10 text-center text-muted-foreground">
        <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-40" />
        <p>No bookings yet. Students will find you soon.</p>
      </div>
    );
  }

  return (
    <div id="dashboard-root" ref={rootRef} className="space-y-9">
      {(view === "all" || view === "upcoming") && (
        <SectionCard title="Requests" count={requests.length}>
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
                  isNew={highlightRequestIds.has(booking.id)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(view === "all" || view === "upcoming") && (
        <SectionCard title="Upcoming Sessions" count={upcoming.length} id="dashboard-upcoming" sectionRef={upcomingRef}>
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
        </SectionCard>
      )}

      {(view === "all" || view === "completed") && (
        <SectionCard title="Completed" count={completed.length} id="dashboard-completed" sectionRef={completedRef}>
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
        </SectionCard>
      )}

      {view === "all" && (
        <SectionCard title="Past" count={past.length}>
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
        </SectionCard>
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
  isNew: boolean;
};

const RequestCard: React.FC<RequestCardProps> = ({ booking, onAccept, onReject, isAccepting, isRejecting, isNew }) => {
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
    <Card className={`border-border/70 shadow-sm transition-all duration-500 hover:shadow-md ${isNew ? "border-primary/40 bg-primary/5" : ""}`}>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold tracking-tight">{booking.student?.name || "Student"}</h3>
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

        <div className="flex w-full justify-start sm:w-auto sm:justify-end">
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
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardView;
