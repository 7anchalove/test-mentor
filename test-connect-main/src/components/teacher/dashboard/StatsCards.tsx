import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, CalendarClock, BarChart3, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardView } from "@/lib/teacherDashboard";

type StatsCardsProps = {
  activeView: DashboardView;
  stats: {
    upcoming: number;
    completed: number;
    total: number;
  };
  onChangeView: (view: DashboardView) => void;
};

const cards: Array<{ key: DashboardView; title: string; valueKey: "upcoming" | "completed" | "total"; icon: LucideIcon }> = [
  { key: "upcoming", title: "Upcoming", valueKey: "upcoming", icon: CalendarClock },
  { key: "completed", title: "Completed", valueKey: "completed", icon: CheckCircle2 },
  { key: "all", title: "Total", valueKey: "total", icon: BarChart3 },
];

const StatsCards: React.FC<StatsCardsProps> = ({ activeView, stats, onChangeView }) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChangeView(item.key)}
            className="text-left"
            aria-pressed={isActive}
          >
            <Card
              className={cn(
                "relative h-full overflow-hidden border-border/70 transition-all duration-200 hover:border-primary/30 hover:shadow-md",
                isActive
                  ? "bg-card shadow-sm ring-1 ring-primary/20"
                  : "bg-card",
              )}
            >
              <span
                className={cn(
                  "absolute inset-x-0 top-0 h-0.5 bg-transparent",
                  isActive && "bg-primary/60",
                )}
              />
              <CardContent className="flex min-h-[132px] flex-col justify-between p-5">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{item.title}</p>
                  <Icon className={cn("h-4 w-4 text-muted-foreground", isActive && "text-primary/80")} />
                </div>
                <p className={cn("text-3xl font-bold tracking-tight", isActive && "text-primary")}>{stats[item.valueKey]}</p>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
};

export default StatsCards;
