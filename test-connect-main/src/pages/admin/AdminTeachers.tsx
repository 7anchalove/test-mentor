import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import AppLayout from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type TeacherRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
};

async function fetchTeachers(): Promise<TeacherRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, name, email, is_suspended, suspended_at")
    .eq("role", "teacher")
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    user_id: row.user_id,
    name: row.name ?? null,
    email: row.email ?? null,
    is_suspended: Boolean(row.is_suspended),
    suspended_at: row.suspended_at ?? null,
  }));
}

const AdminTeachers = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reasonByTeacher, setReasonByTeacher] = useState<Record<string, string>>({});

  const {
    data: teachers = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: fetchTeachers,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ teacherUserId, suspended, reason }: { teacherUserId: string; suspended: boolean; reason: string | null }) => {
      const { error: rpcError } = await supabase.rpc("admin_set_teacher_suspended", {
        teacher_user_id: teacherUserId,
        suspended,
        reason,
      } as any);

      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      toast({ title: "Teacher status updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-teachers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview-counts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview-audit"] });
    },
    onError: (mutationError: any) => {
      toast({
        title: "Could not update teacher",
        description: mutationError?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const isWorkingTeacherId = suspendMutation.variables?.teacherUserId;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Admin Teachers</h1>
          <p className="text-sm text-muted-foreground">Suspend or unsuspend teachers.</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load teachers</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Teachers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading teachers...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Suspended At</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.map((teacher) => {
                    const isWorking = suspendMutation.isPending && isWorkingTeacherId === teacher.user_id;
                    const reason = reasonByTeacher[teacher.user_id] ?? "";

                    return (
                      <TableRow key={teacher.user_id}>
                        <TableCell>{teacher.name ?? "Teacher"}</TableCell>
                        <TableCell>{teacher.email ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant={teacher.is_suspended ? "destructive" : "secondary"}>
                            {teacher.is_suspended ? "Suspended" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>{teacher.suspended_at ? new Date(teacher.suspended_at).toLocaleString() : "-"}</TableCell>
                        <TableCell>
                          <Input
                            value={reason}
                            onChange={(event) =>
                              setReasonByTeacher((current) => ({
                                ...current,
                                [teacher.user_id]: event.target.value,
                              }))
                            }
                            placeholder="Optional reason"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={teacher.is_suspended ? "secondary" : "destructive"}
                            disabled={isWorking}
                            onClick={() =>
                              suspendMutation.mutate({
                                teacherUserId: teacher.user_id,
                                suspended: !teacher.is_suspended,
                                reason: reason.trim() ? reason.trim() : null,
                              })
                            }
                          >
                            {isWorking ? "Saving..." : teacher.is_suspended ? "Unsuspend" : "Suspend"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!teachers.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No teachers found.
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

export default AdminTeachers;