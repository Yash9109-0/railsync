import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardPageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function DashboardPageHeader({
  icon: Icon,
  title,
  description,
  action,
}: DashboardPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 flex-wrap",
        "border-b border-border pb-4",
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  );
}
