import { Badge } from "@/components/ui/badge";

const DashboardHeader = () => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">
          Teacher
        </Badge>
      </div>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Teacher Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Manage requests, sessions, and completed work in one place.
        </p>
      </div>

      <div className="h-px w-full bg-border/80" />
    </div>
  );
};

export default DashboardHeader;
