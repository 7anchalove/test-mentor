import { useQuery } from "@tanstack/react-query";

import AppLayout from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type AdminAction = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

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

function isMissingTableError(error: unknown) {
  const code = String((error as { code?: string } | null | undefined)?.code ?? "").toUpperCase();
  return code === "42P01" || code === "PGRST205";
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

async function fetchRecentAdminActions(): Promise<{ rows: AdminAction[]; unavailable: boolean }> {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, action, entity, entity_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingTableError(error)) return { rows: [], unavailable: true };
    throw error;
  }

  return {
    rows: ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      action: String(row.action ?? ""),
      entity: String(row.entity ?? ""),
      entity_id: row.entity_id ?? null,
      details: (row.details as Record<string, unknown> | null) ?? null,
      created_at: String(row.created_at ?? ""),
    })),
    unavailable: false,
  };
}

const AdminDashboard = () => {
  const {
    data: counts,
    isLoading: isLoadingCounts,
    error: countsError,
  } = useQuery({
    queryKey: ["admin-overview-counts"],
    queryFn: fetchOverviewCounts,
  });

  const {
    data: recentActions,
    isLoading: isLoadingActions,
    error: actionsError,
  } = useQuery({
    queryKey: ["admin-overview-audit"],
    queryFn: fetchRecentAdminActions,
  });

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Admin Overview</h1>
          <p className="text-sm text-muted-foreground">Platform metrics and recent administrative actions.</p>
        </div>

        {(countsError || actionsError) && (
          <Alert variant="destructive">
            <AlertTitle>Could not load admin data</AlertTitle>
            <AlertDescription>{formatSupabaseError(countsError ?? actionsError)}</AlertDescription>
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
            {isLoadingActions && <p className="text-sm text-muted-foreground">Loading recent actions...</p>}

            {!isLoadingActions && recentActions?.unavailable && (
              <p className="text-sm text-muted-foreground">Audit log table is not available in this environment.</p>
            )}

            {!isLoadingActions && !recentActions?.unavailable && (recentActions?.rows.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No admin actions found yet.</p>
            )}

            {!isLoadingActions && !recentActions?.unavailable && (recentActions?.rows.length ?? 0) > 0 && (
              <div className="space-y-2">
                {recentActions?.rows.map((item) => (
                  <div key={item.id} className="rounded-md border p-3">
                    <div className="text-sm font-medium">
                      {item.action} · {item.entity}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
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