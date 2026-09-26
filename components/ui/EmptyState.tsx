import type { ComponentType } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EmptyStateContext = "default" | "no-data" | "no-pending" | "no-requests" | "all-caught-up";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  illustrationSrc?: string;
  illustrationAlt?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  context?: EmptyStateContext;
  hasAnyData?: boolean;
}

const CONTEXT_MESSAGES: Record<EmptyStateContext, { title: string; description: string }> = {
  default: {
    title: "Nothing here yet",
    description: "Get started by adding your first item.",
  },
  "no-data": {
    title: "No data available",
    description: "There's nothing to show at the moment.",
  },
  "no-pending": {
    title: "No pending requests — you're all caught up!",
    description: "Relax, there's nothing waiting for your attention right now.",
  },
  "no-requests": {
    title: "No requests yet",
    description: "Submit your first one below to get started.",
  },
  "all-caught-up": {
    title: "All caught up!",
    description: "Everything is up to date. Great job!",
  },
};

const ILLUSTRATION_SIZES: Record<string, { width: number; height: number }> = {
  "maintenance-all-clear.svg": { width: 280, height: 252 },
  "ai-all-caught-up.svg": { width: 280, height: 440 },
  "field-empty-progress.svg": { width: 280, height: 305 },
  "landing-hero.svg": { width: 400, height: 208 },
};

export function EmptyState({
  icon: Icon,
  illustrationSrc,
  illustrationAlt,
  title,
  description,
  actionLabel,
  onAction,
  className,
  context = "default",
  hasAnyData = false,
}: EmptyStateProps) {
  const contextMessage = CONTEXT_MESSAGES[context];
  const displayTitle = title || contextMessage.title;
  const displayDescription = description || (hasAnyData ? contextMessage.description : "Get started by adding your first item.");

  const illustrationSize = illustrationSrc
    ? ILLUSTRATION_SIZES[illustrationSrc.split('/').pop() || ''] ?? { width: 280, height: 200 }
    : { width: 280, height: 200 };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center py-12",
        className,
      )}
    >
      {illustrationSrc ? (
        <div className="w-full max-w-md mx-auto">
          <Image
            src={`/illustrations/${illustrationSrc}`}
            alt={illustrationAlt || displayTitle}
            width={illustrationSize.width}
            height={illustrationSize.height}
            className="mx-auto"
            priority={false}
          />
        </div>
      ) : Icon ? (
        <div className="rounded-full bg-muted/30 p-4">
          <Icon className="h-8 w-8 text-muted-foreground/50" />
        </div>
      ) : null}
      <h3 className="text-lg font-medium">{displayTitle}</h3>
      {displayDescription ? (
        <p className="text-sm text-muted-foreground max-w-sm">
          {displayDescription}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}