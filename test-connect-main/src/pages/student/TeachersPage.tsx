import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/layout/AppLayout";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type TestCategory = Database["public"]["Enums"]["test_category"];

interface TeacherWithAvailability {
  userId: string;
  name: string;
  bio: string | null;
  headline: string | null;
  subjects: string[] | null;
  isAvailable: boolean;
  spotsLeft: number;
  computedCapacity: number;
}

const TeachersPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookingTeacherId, setBookingTeacherId] = useState<string | null>(null);

  const category = searchParams.get("category") as TestCategory;
  const subtype = searchParams.get("subtype") || null;
  const datetimeStr = searchParams.get("datetime") || "";
  const selectedDate = new Date(datetimeStr);

  const { data: teachers, isLoading } = useQuery({
    queryKey: ["teachers-availability", datetimeStr, category],
    queryFn: async (): Promise<TeacherWithAvailability[]> => {
      const [teachersRes, availabilityRes] = await Promise.all([
        (async () => {
          const { data: teacherProfiles, error: tpErr } = await supabase
            .from("teacher_profiles")
            .select("user_id, headline, subjects")
            .eq("is_active", true);
          if (tpErr) throw tpErr;
          if (!teacherProfiles?.length) return { profiles: [], teacherProfiles: [] };

          const teacherIds = teacherProfiles.map((tp) => tp.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, name, bio")
            .in("user_id", teacherIds);
          return { profiles: profiles ?? [], teacherProfiles };
        })(),
        supabase.rpc("get_teachers_availability", {
          p_datetime_utc: datetimeStr,
          p_test_category: category || null,
        }),
      ]);

      const { teacherProfiles, profiles } = teachersRes;
      if (!teacherProfiles?.length) return [];

      const { data: availabilityRows, error: availErr } = availabilityRes;
      if (availErr) throw availErr;

      const rowByTeacher = new Map(
        (availabilityRows ?? []).map((row) => [
          row.teacher_id,
          {
            is_available: row.is_available,
            spots_left: row.spots_left ?? 0,
            computed_capacity: row.computed_capacity ?? 4,
          },
        ])
      );

      return teacherProfiles.map((tp) => {
        const profile = profiles?.find((p) => p.user_id === tp.user_id);
        const avail = rowByTeacher.get(tp.user_id);
        const isAvailable = avail?.is_available ?? false;
        const spotsLeft = avail?.spots_left ?? 0;
        const computedCapacity = avail?.computed_capacity ?? 4;
        return {
          userId: tp.user_id,
          name: profile?.name || "Unknown Teacher",
          bio: profile?.bio,
          headline: tp.headline,
          subjects: tp.subjects,
          isAvailable,
          spotsLeft,
          computedCapacity,
        };
      });
    },
    enabled: !!datetimeStr,
  });

  const bookMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Create student test selection
      const { data: selection, error: selErr } = await supabase
        .from("student_test_selections")
        .insert({
          student_id: user.id,
          test_category: category,
          test_subtype: subtype,
          test_date_time: datetimeStr,
        })
        .select()
        .single();

      if (selErr) throw selErr;

      // // Create booking request (STEP 1 of workflow)
      const { data: booking, error: bookErr } = await supabase
      .from("bookings")
      .insert({
        student_id: user.id,
        teacher_id: teacherId,
        student_test_selection_id: selection.id,
        start_date_time: datetimeStr,
        status: "awaiting_receipt",
        teacher_note: "WAITING_FOR_RECEIPT"
      } as any)   // ← important
      .select()
      .single();    


      if (bookErr) throw bookErr;
      if (!booking) throw new Error("Booking request could not be created");

      return booking;
    },
    onSuccess: () => {
      toast({
        title: "Request sent — waiting for teacher approval",
      });
      setBookingTeacherId(null);
      queryClient.invalidateQueries({ queryKey: ["teachers-availability", datetimeStr, category] });
    },
    onError: (err: Error) => {
      const isCapacityFull =
        err.message?.includes("CAPACITY_FULL") ||
        err.message?.toLowerCase().includes("capacity") ||
        err.message?.toLowerCase().includes("slot is full");
      toast({
        title: "Booking Failed",
        description: isCapacityFull
          ? "This time slot is full for this teacher. Please pick another time or teacher."
          : err.message,
        variant: "destructive",
      });
      setBookingTeacherId(null);
    },
  });

  const handleSelectTeacher = (teacherId: string) => {
    setBookingTeacherId(teacherId);
    bookMutation.mutate(teacherId);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Available Teachers</h1>
          <p className="mt-2 text-muted-foreground">
            For {category.replace("_", " ")} {subtype ? `(${subtype})` : ""} on{" "}
            {format(selectedDate, "EEEE, MMMM d 'at' HH:mm")}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !teachers?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <User className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No teachers found. Try a different date or time.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {teachers
              .sort((a, b) => (a.isAvailable === b.isAvailable ? 0 : a.isAvailable ? -1 : 1))
              .map((teacher) => (
                <Card key={teacher.userId} className="transition-all hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold font-display">{teacher.name}</h3>
                        {teacher.headline && (
                          <p className="text-sm text-muted-foreground">{teacher.headline}</p>
                        )}
                        {teacher.subjects?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {teacher.subjects.map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={teacher.isAvailable ? "default" : "secondary"} className={`gap-1 ${teacher.isAvailable ? "bg-success text-success-foreground" : ""}`}>
                        {teacher.isAvailable ? (
                          <><CheckCircle className="h-3 w-3" /> Available</>
                        ) : (
                          <><XCircle className="h-3 w-3" /> Not available</>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Spots left: {teacher.spotsLeft}
                      </span>
                      {teacher.isAvailable && (
                        <Button
                          size="sm"
                          disabled={bookingTeacherId !== null}
                          onClick={() => handleSelectTeacher(teacher.userId)}
                        >
                          {bookingTeacherId === teacher.userId ? "Booking..." : "Select"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TeachersPage;
