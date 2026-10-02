"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Wraps dashboard page content so every route change gets a smooth
 * fade-and-rise entrance (keyed to the path, it replays on navigation).
 * Also resets the main scroll container to the top on each route change,
 * since the dashboard scrolls inside `main`, which Next does not do for us.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.querySelector("main.overflow-y-auto");
    main?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div key={pathname} className={cn("animate-fade-in-up", className)}>
      {children}
    </div>
  );
}
