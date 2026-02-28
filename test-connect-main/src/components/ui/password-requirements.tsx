import { useMemo } from "react";
import { Check, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordRequirementsProps {
  password: string;
  /** Minimum password length (default: 6) */
  minLength?: number;
  className?: string;
}

interface Requirement {
  label: string;
  met: boolean;
}

/**
 * Friendly password‑requirements checklist.
 * Shows each rule with a green check or muted X while the user types.
 * Only renders when the password field is non‑empty.
 */
export function PasswordRequirements({
  password,
  minLength = 6,
  className,
}: PasswordRequirementsProps) {
  const requirements: Requirement[] = useMemo(
    () => [
      { label: `At least ${minLength} characters`, met: password.length >= minLength },
      { label: "Contains a number", met: /\d/.test(password) },
      { label: "Contains a letter", met: /[a-zA-Z]/.test(password) },
    ],
    [password, minLength],
  );

  if (!password) return null;

  const allMet = requirements.every((r) => r.met);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm animate-in fade-in-0 slide-in-from-top-1 duration-200",
        allMet
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40"
          : "border-border bg-muted/40",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 font-medium text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Password strength
      </div>
      <ul className="space-y-1">
        {requirements.map((req) => (
          <li key={req.label} className="flex items-center gap-2">
            {req.met ? (
              <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            ) : (
              <X className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
            <span
              className={cn(
                "transition-colors duration-150",
                req.met
                  ? "text-green-700 dark:text-green-400"
                  : "text-muted-foreground",
              )}
            >
              {req.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
