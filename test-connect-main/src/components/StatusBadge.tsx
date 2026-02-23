import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStatusBadgeClassName, toStatusLabel } from "@/lib/status";

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge className={cn("uppercase", getStatusBadgeClassName(status), className)}>
      {toStatusLabel(status)}
    </Badge>
  );
}
