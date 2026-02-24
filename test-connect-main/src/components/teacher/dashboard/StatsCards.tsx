import { Card, CardContent } from "@/components/ui/card";
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

const cards: Array<{ key: DashboardView; title: string; valueKey: "upcoming" | "completed" | "total" }> = [
  { key: "upcoming", title: "Upcoming", valueKey: "upcoming" },
  { key: "completed", title: "Completed", valueKey: "completed" },
  { key: "all", title: "Total", valueKey: "total" },
];

const StatsCards: React.FC<StatsCardsProps> = ({ activeView, stats, onChangeView }) => {
  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-3">
      {cards.map((item) => {
        const isActive = activeView === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChangeView(item.key)}
            className="text-left transition-transform duration-200 hover:-translate-y-0.5"
            aria-pressed={isActive}
          >
            <Card
              className={cn(
                "border-border/80 transition-all duration-200 hover:shadow-sm",
                isActive
                  ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                  : "border-border/80 bg-card",
              )}
            >
              <CardContent className="p-5">
                <p className={cn("text-3xl font-bold font-display", isActive && "text-primary")}>{stats[item.valueKey]}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.title}</p>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
};

export default StatsCards;
