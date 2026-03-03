import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import AppLayout from "@/components/layout/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_STATUS } from "@/lib/bookingStatus";
import { PAYMENT_STATUS } from "@/lib/paymentStatus";

type AdminBooking = {
  id: string;
  created_at: string;
  status: string;
  start_date_time: string;
  payment_status: string | null;
  student_id: string;
  teacher_id: string;
  student_name: string | null;
  teacher_name: string | null;
};

function isMissingColumnError(error: any, column: string) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes(column.toLowerCase()) && message.includes("does not exist");
}

async function fetchAdminBookings(): Promise<{ rows: AdminBooking[]; hasPaymentStatus: boolean }> {
  let hasPaymentStatus = true;

  const baseSelect = "id, created_at, status, start_date_time, student_id, teacher_id";
  let selectColumns = `${baseSelect}, payment_status`;

  let data: any[] | null = null;
  let error: any = null;

  ({ data, error } = await supabase.from("bookings").select(selectColumns).order("created_at", { ascending: false }).limit(200));

  if (error && isMissingColumnError(error, "payment_status")) {
    hasPaymentStatus = false;
    ({ data, error } = await supabase.from("bookings").select(baseSelect).order("created_at", { ascending: false }).limit(200));
  }

  if (error) throw error;

  const bookingRows = data ?? [];
  if (!bookingRows.length) return { rows: [], hasPaymentStatus };

  const studentIds = [...new Set(bookingRows.map((row) => row.student_id).filter(Boolean))];
  const teacherIds = [...new Set(bookingRows.map((row) => row.teacher_id).filter(Boolean))];
  const allProfileIds = [...new Set([...studentIds, ...teacherIds])];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, name")
    .in("user_id", allProfileIds);

  if (profilesError) throw profilesError;

  return {
    hasPaymentStatus,
    rows: bookingRows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      status: row.status,
      start_date_time: row.start_date_time,
      payment_status: hasPaymentStatus ? row.payment_status ?? null : null,
      student_id: row.student_id,
      teacher_id: row.teacher_id,
      student_name: profiles?.find((profile) => profile.user_id === row.student_id)?.name ?? null,
      teacher_name: profiles?.find((profile) => profile.user_id === row.teacher_id)?.name ?? null,
    })),
  };
}

const ALL_FILTER = "all";

const AdminBookings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  const [paymentFilter, setPaymentFilter] = useState<string>(ALL_FILTER);
  const [overrideStatusByBooking, setOverrideStatusByBooking] = useState<Record<string, string>>({});
  const [overrideReasonByBooking, setOverrideReasonByBooking] = useState<Record<string, string>>({});

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: fetchAdminBookings,
  });

  const filteredBookings = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.filter((row) => {
      if (statusFilter !== ALL_FILTER && row.status !== statusFilter) return false;
      if (paymentFilter !== ALL_FILTER && (row.payment_status ?? "") !== paymentFilter) return false;
      return true;
    });
  }, [data?.rows, paymentFilter, statusFilter]);

  const overrideMutation = useMutation({
    mutationFn: async ({ bookingId, newStatus, reason }: { bookingId: string; newStatus: string; reason: string }) => {
      if (!reason.trim()) throw new Error("Reason is required for override.");

      const { error: rpcError } = await supabase.rpc("admin_override_booking_status", {
        booking_id: bookingId,
        new_status: newStatus,
        reason,
      } as any);

      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      toast({ title: "Booking status overridden" });
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview-counts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview-audit"] });
    },
    onError: (mutationError: any) => {
      toast({
        title: "Could not override booking",
        description: mutationError?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const workingBookingId = overrideMutation.variables?.bookingId;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Admin Bookings</h1>
          <p className="text-sm text-muted-foreground">Review bookings and override status when required.</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load bookings</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Status</p>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>All</SelectItem>
                  {Object.values(BOOKING_STATUS).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Payment status</p>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All payment statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>All</SelectItem>
                  {Object.values(PAYMENT_STATUS).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!data?.hasPaymentStatus && (
                <p className="mt-1 text-xs text-muted-foreground">`payment_status` is unavailable in this environment.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading bookings...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Slot</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking) => {
                    const pendingStatus = overrideStatusByBooking[booking.id] ?? booking.status;
                    const reason = overrideReasonByBooking[booking.id] ?? "";
                    const isWorking = overrideMutation.isPending && workingBookingId === booking.id;

                    return (
                      <TableRow key={booking.id}>
                        <TableCell>{new Date(booking.created_at).toLocaleString()}</TableCell>
                        <TableCell>{booking.student_name ?? booking.student_id}</TableCell>
                        <TableCell>{booking.teacher_name ?? booking.teacher_id}</TableCell>
                        <TableCell>{new Date(booking.start_date_time).toLocaleString()}</TableCell>
                        <TableCell>
                          <StatusBadge status={booking.status} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={booking.payment_status ?? "unknown"} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                  Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Booking details</DialogTitle>
                                  <DialogDescription>{booking.id}</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-2 text-sm">
                                  <p>
                                    <strong>Student:</strong> {booking.student_name ?? booking.student_id}
                                  </p>
                                  <p>
                                    <strong>Teacher:</strong> {booking.teacher_name ?? booking.teacher_id}
                                  </p>
                                  <p>
                                    <strong>Created:</strong> {new Date(booking.created_at).toLocaleString()}
                                  </p>
                                  <p>
                                    <strong>Slot:</strong> {new Date(booking.start_date_time).toLocaleString()}
                                  </p>
                                  <p>
                                    <strong>Status:</strong> {booking.status}
                                  </p>
                                  <p>
                                    <strong>Payment:</strong> {booking.payment_status ?? "N/A"}
                                  </p>
                                </div>
                              </DialogContent>
                            </Dialog>

                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm">Override</Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Override booking status</DialogTitle>
                                  <DialogDescription>Reason is required and will be audited.</DialogDescription>
                                </DialogHeader>

                                <div className="space-y-3">
                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">New status</p>
                                    <Select
                                      value={pendingStatus}
                                      onValueChange={(value) =>
                                        setOverrideStatusByBooking((current) => ({
                                          ...current,
                                          [booking.id]: value,
                                        }))
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {Object.values(BOOKING_STATUS).map((value) => (
                                          <SelectItem key={value} value={value}>
                                            {value}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">Reason</p>
                                    <Input
                                      value={reason}
                                      onChange={(event) =>
                                        setOverrideReasonByBooking((current) => ({
                                          ...current,
                                          [booking.id]: event.target.value,
                                        }))
                                      }
                                      placeholder="Required reason"
                                    />
                                  </div>
                                </div>

                                <DialogFooter>
                                  <Button
                                    disabled={isWorking}
                                    onClick={() =>
                                      overrideMutation.mutate({
                                        bookingId: booking.id,
                                        newStatus: pendingStatus,
                                        reason,
                                      })
                                    }
                                  >
                                    {isWorking ? "Saving..." : "Apply override"}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!filteredBookings.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        No bookings match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminBookings;