import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import AppLayout from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";

const timeSlots = Array.from({ length: 24 }, (_, h) => {
  return ["00", "30"].map((m) => `${String(h).padStart(2, "0")}:${m}`);
}).flat();

const PickDateTimePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") || "";
  const subtype = searchParams.get("subtype") || "";

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");

  const handleContinue = () => {
    if (!date || !time) return;
    const [hours, minutes] = time.split(":");
    const dateTime = new Date(date);
    dateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    const params = new URLSearchParams({
      category,
      ...(subtype && { subtype }),
      datetime: dateTime.toISOString(),
    });
    navigate(`/teachers?${params.toString()}`);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="text-3xl font-bold font-display">Pick Date & Time</h1>
          <p className="mt-2 text-muted-foreground">
            When would you like your {category.replace("_", " ")} {subtype ? `(${subtype})` : ""} session?
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarIcon className="h-5 w-5 text-primary" />
              <h3 className="font-semibold font-display">Select Date</h3>
            </div>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={(d) => d < new Date()}
              className={cn("pointer-events-auto")}
            />
          </div>

          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold font-display">Select Time</h3>
            </div>
            {date ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  {format(date, "EEEE, MMMM d, yyyy")}
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {timeSlots.map((slot) => (
                    <Button
                      key={slot}
                      variant={time === slot ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTime(slot)}
                      className="text-sm"
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Please select a date first</p>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button onClick={handleContinue} disabled={!date || !time} size="lg" className="gap-2">
            Find Teachers <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default PickDateTimePage;
