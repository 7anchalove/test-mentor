import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/layout/AppLayout";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const AvailabilityPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Weekly Rules ──
  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ["availability-rules", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_availability_rules")
        .select("*")
        .eq("teacher_id", user!.id)
        .order("day_of_week");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [newDay, setNewDay] = useState("1");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");

  const addRuleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("teacher_availability_rules").insert({
        teacher_id: user!.id,
        day_of_week: parseInt(newDay),
        start_time: newStart,
        end_time: newEnd,
        enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-rules"] });
      toast({ title: "Rule added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("teacher_availability_rules")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["availability-rules"] }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teacher_availability_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-rules"] });
      toast({ title: "Rule removed" });
    },
  });

  // ── Unavailable Dates ──
  const { data: unavailableDates, isLoading: unavailLoading } = useQuery({
    queryKey: ["unavailable-dates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_unavailable_dates")
        .select("*")
        .eq("teacher_id", user!.id)
        .order("start_date_time");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [exDate, setExDate] = useState<Date | undefined>();
  const [exStartTime, setExStartTime] = useState("09:00");
  const [exEndTime, setExEndTime] = useState("17:00");
  const [exReason, setExReason] = useState("");

  const addExceptionMutation = useMutation({
    mutationFn: async () => {
      if (!exDate) throw new Error("Select a date");
      const startDt = new Date(exDate);
      const [sh, sm] = exStartTime.split(":");
      startDt.setHours(parseInt(sh), parseInt(sm), 0, 0);

      const endDt = new Date(exDate);
      const [eh, em] = exEndTime.split(":");
      endDt.setHours(parseInt(eh), parseInt(em), 0, 0);

      const { error } = await supabase.from("teacher_unavailable_dates").insert({
        teacher_id: user!.id,
        start_date_time: startDt.toISOString(),
        end_date_time: endDt.toISOString(),
        reason: exReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unavailable-dates"] });
      toast({ title: "Exception added" });
      setExDate(undefined);
      setExReason("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteExceptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teacher_unavailable_dates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unavailable-dates"] });
      toast({ title: "Exception removed" });
    },
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-display">Availability</h1>
          <p className="mt-2 text-muted-foreground">Set your weekly schedule and mark exceptions</p>
        </div>

        {/* Weekly Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Weekly Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rulesLoading ? (
              <div className="h-20 animate-pulse bg-muted rounded" />
            ) : rules?.length ? (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(checked) =>
                          toggleRuleMutation.mutate({ id: rule.id, enabled: checked })
                        }
                      />
                      <span className={`font-medium ${!rule.enabled ? "text-muted-foreground line-through" : ""}`}>
                        {DAYS[rule.day_of_week]}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteRuleMutation.mutate(rule.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No rules yet. Add your weekly availability below.</p>
            )}

            <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-border">
              <div>
                <Label className="text-xs">Day</Label>
                <Select value={newDay} onValueChange={setNewDay}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="w-[120px]" />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="w-[120px]" />
              </div>
              <Button onClick={() => addRuleMutation.mutate()} disabled={addRuleMutation.isPending} className="gap-1">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Unavailable Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-destructive" />
              Unavailable Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {unavailLoading ? (
              <div className="h-20 animate-pulse bg-muted rounded" />
            ) : unavailableDates?.length ? (
              <div className="space-y-3">
                {unavailableDates.map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                    <div>
                      <span className="font-medium">
                        {format(new Date(ex.start_date_time), "MMM d, yyyy")}
                      </span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {format(new Date(ex.start_date_time), "HH:mm")} – {format(new Date(ex.end_date_time), "HH:mm")}
                      </span>
                      {ex.reason && <p className="text-sm text-muted-foreground mt-0.5">{ex.reason}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteExceptionMutation.mutate(ex.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No exceptions set.</p>
            )}

            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !exDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {exDate ? format(exDate, "PPP") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={exDate} onSelect={setExDate} disabled={(d) => d < new Date()} className="pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="time" value={exStartTime} onChange={(e) => setExStartTime(e.target.value)} className="w-[120px]" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="time" value={exEndTime} onChange={(e) => setExEndTime(e.target.value)} className="w-[120px]" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea value={exReason} onChange={(e) => setExReason(e.target.value)} placeholder="e.g. vacation, personal" className="max-w-md" />
              </div>
              <Button onClick={() => addExceptionMutation.mutate()} disabled={addExceptionMutation.isPending || !exDate} className="gap-1">
                <Plus className="h-4 w-4" /> Add Exception
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AvailabilityPage;
