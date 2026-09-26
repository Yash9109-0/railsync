"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OnboardingTrigger } from "@/components/OnboardingTour";

interface OnboardingWrapperProps {
  children: React.ReactNode;
  userId: string;
  role: string | null;
}

export function OnboardingWrapper({ children, userId, role }: OnboardingWrapperProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <OnboardingTrigger userId={userId} role={(role as "admin" | "maintenance" | "control" | "field") || "maintenance"}>
      {children}
    </OnboardingTrigger>
  );
}