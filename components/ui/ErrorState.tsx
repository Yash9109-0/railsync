import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  message?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export function ErrorState({
  message = "Something went wrong loading this",
  description,
  onRetry,
  retrying,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 py-10 text-center",
        className,
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{message}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
          className="mt-2"
        >
          {retrying ? "Retrying..." : "Retry"}
        </Button>
      ) : null}
    </div>
  );
}
