/**
 * Dev-only: sanity checks for get_teachers_availability RPC.
 * Run 3 sample datetimes (Africa/Tunis) and display results.
 * Access at /dev/availability-test when running in development.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Scenario {
  label: string;
  datetimeUtc: string;
  description: string;
}

const SCENARIOS: Scenario[] = [
  {
    label: "Monday 11:00 Africa/Tunis (in 09:00–13:00 block)",
    datetimeUtc: "2026-02-09T10:00:00.000Z", // UTC+1 in Feb
    description: "Expect teachers with Mon 09:00–13:00 to be available.",
  },
  {
    label: "Saturday 13:00 Africa/Tunis",
    datetimeUtc: "2026-02-07T12:00:00.000Z",
    description: "Seed has no Saturday rules → expect all not available.",
  },
  {
    label: "Monday 09:00 Africa/Tunis (start of block)",
    datetimeUtc: "2026-02-09T08:00:00.000Z",
    description: "Boundary: 09:00 is inclusive start → expect available.",
  },
];

interface ResultRow {
  teacher_id: string;
  is_available: boolean;
}

export default function AvailabilityTestPage() {
  const [results, setResults] = useState<Record<string, { rows: ResultRow[]; error?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { rows: ResultRow[]; error?: string }> = {};
      for (const s of SCENARIOS) {
        const { data, error } = await supabase.rpc("get_teachers_availability", {
          p_datetime_utc: s.datetimeUtc,
        });
        if (cancelled) return;
        if (error) {
          next[s.datetimeUtc] = { rows: [], error: error.message };
          console.error(`[AvailabilityTest] ${s.label}:`, error);
        } else {
          next[s.datetimeUtc] = { rows: (data ?? []) as ResultRow[] };
          console.log(`[AvailabilityTest] ${s.label}`, { count: (data ?? []).length, available: (data ?? []).filter((r: ResultRow) => r.is_available).length, raw: data });
        }
      }
      if (!cancelled) {
        setResults(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="p-8">Running 3 sanity-check RPC calls…</div>;

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Availability RPC sanity checks</h1>
      <p className="text-sm text-muted-foreground">Dev-only. Three fixed datetimes in Africa/Tunis; results logged to console and shown below.</p>
      {SCENARIOS.map((s) => {
        const r = results[s.datetimeUtc];
        const availableCount = r?.rows?.filter((x) => x.is_available).length ?? 0;
        const total = r?.rows?.length ?? 0;
        return (
          <div key={s.datetimeUtc} className="rounded-lg border p-4 space-y-1">
            <div className="font-medium">{s.label}</div>
            <div className="text-sm text-muted-foreground">{s.description}</div>
            {r?.error ? (
              <pre className="text-destructive text-sm">{r.error}</pre>
            ) : (
              <div className="text-sm">
                Available: {availableCount} / {total}
                {total > 0 && (
                  <pre className="mt-2 text-xs bg-muted p-2 overflow-auto max-h-24">
                    {JSON.stringify(r?.rows ?? [], null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
