import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import AppLayout from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { type AdminAuditRow, formatAuditRow } from "@/lib/adminAuditFormat";

type OverviewCounts = {
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  totalBookings: number;
  paidBookings: number | null;
};

function formatSupabaseError(error: unknown) {
  const anyError = error as { code?: string; message?: string } | null | undefined;
  const code = String(anyError?.code ?? "").trim();
  const message = String(anyError?.message ?? "Unknown error").trim();
  return code ? `${message} (code: ${code})` : message;
}

function isMissingColumnError(error: any, column: string) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes(column.toLowerCase()) && message.includes("does not exist");
}

async function fetchCount(table: string, filters?: Array<{ column: string; value: string }>) {
  let query = supabase.from(table as any).select("id", { count: "exact", head: true });

  for (const filter of filters ?? []) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchOverviewCounts(): Promise<OverviewCounts> {
  const [totalUsers, totalTeachers, totalStudents, totalBookings] = await Promise.all([
    fetchCount("profiles"),
    fetchCount("profiles", [{ column: "role", value: "teacher" }]),
    fetchCount("profiles", [{ column: "role", value: "student" }]),
    fetchCount("bookings"),
  ]);

  let paidBookings: number | null = null;

  const { count: paidCount, error: paidError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "paid");

  if (paidError) {
    if (!isMissingColumnError(paidError, "payment_status")) throw paidError;
  } else {
    paidBookings = paidCount ?? 0;
  }

  return {
    totalUsers,
    totalTeachers,
    totalStudents,
    totalBookings,
    paidBookings,
  };
}

const AdminDashboard = () => {
  const [actions, setActions] = useState<AdminAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    data: counts,
    isLoading: isLoadingCounts,
    error: countsError,
  } = useQuery({
    queryKey: ["admin-overview-counts"],
    queryFn: fetchOverviewCounts,
  });

  useEffect(() => {
    let isMounted = true;

    const loadActions = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("admin_audit_log")
          .select("id,created_at,admin_user_id,action,entity_type,entity_id,before,after")
          .order("created_at", { ascending: false })
          .limit(20);

        if (fetchError) throw fetchError;

        if (!isMounted) return;

        setActions(
          ((data ?? []) as any[]).map((row) => ({
            id: String(row.id ?? ""),
            created_at: String(row.created_at ?? ""),
            admin_user_id: String(row.admin_user_id ?? ""),
            action: String(row.action ?? ""),
            entity_type: row.entity_type ? String(row.entity_type) : null,
            entity_id: row.entity_id ?? null,
            before: (row.before as Record<string, unknown> | null) ?? null,
            after: (row.after as Record<string, unknown> | null) ?? null,
          })),
        );
      } catch (caughtError: unknown) {
        if (!isMounted) return;
        setError(formatSupabaseError(caughtError));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    loadActions();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Admin Overview</h1>
          <p className="text-sm text-muted-foreground">Platform metrics and recent administrative actions.</p>
        </div>

        {countsError && (
          <Alert variant="destructive">
            <AlertTitle>Could not load admin data</AlertTitle>
            <AlertDescription>{formatSupabaseError(countsError)}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Users</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{isLoadingCounts ? "..." : counts?.totalUsers ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Teachers</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{isLoadingCounts ? "..." : counts?.totalTeachers ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Students</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{isLoadingCounts ? "..." : counts?.totalStudents ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Bookings</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{isLoadingCounts ? "..." : counts?.totalBookings ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Paid Bookings</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {isLoadingCounts ? "..." : counts?.paidBookings === null ? "N/A" : counts?.paidBookings ?? 0}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent admin actions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground">Loading recent actions...</p>}

            {!loading && error && (
              <p className="text-sm text-destructive">Failed to load admin actions: {error}</p>
            )}

            {!loading && !error && actions.length === 0 && (
              <p className="text-sm text-muted-foreground">No admin actions yet.</p>
            )}

            {!loading && !error && actions.length > 0 && (
              <div className="space-y-2">
                {actions.map((item) => (
                  <div key={item.id} className="rounded-md border p-3">
                    {(() => {
                      const formatted = formatAuditRow(item);
                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">{formatted.title}</div>
                              {formatted.subtitle && (
                                <div className="text-sm text-muted-foreground">{formatted.subtitle}</div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {new Date(item.created_at).toLocaleString()}
                                {formatted.meta ? ` · ${formatted.meta}` : ""}
                              </div>
                            </div>

                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline">Details</Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Admin action details</DialogTitle>
                                  <DialogDescription>{item.id}</DialogDescription>
                                </DialogHeader>

                                <div className="space-y-2 text-sm">
                                  <p><strong>Action:</strong> {item.action}</p>
                                  <p><strong>Entity Type:</strong> {item.entity_type ?? "-"}</p>
                                  <p><strong>Entity ID:</strong> {item.entity_id ?? "-"}</p>
                                  <p><strong>Admin User ID:</strong> {item.admin_user_id || "-"}</p>
                                  <p><strong>Created At:</strong> {new Date(item.created_at).toLocaleString()}</p>
                                  {formatted.reason && <p><strong>Reason:</strong> {formatted.reason}</p>}
                                </div>

                                <div className="space-y-2">
                                  <details className="rounded-md border p-2">
                                    <summary className="cursor-pointer text-sm font-medium">Before JSON</summary>
                                    <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
                                      {JSON.stringify(item.before, null, 2)}
                                    </pre>
                                  </details>

                                  <details className="rounded-md border p-2">
                                    <summary className="cursor-pointer text-sm font-medium">After JSON</summary>
                                    <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
                                      {JSON.stringify(item.after, null, 2)}
                                    </pre>
                                  </details>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminDashboard;