import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { CorridorProvider } from "@/context/CorridorContext";
import { DashboardTopBar } from "@/components/dashboard-top-bar";
import { OnboardingWrapper } from "@/components/OnboardingWrapper";
import { LoadingBar } from "@/components/LoadingBar";

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, assigned_corridor_id")
    .eq("id", user.id)
    .single();

  return (
    <OnboardingWrapper userId={user.id} role={profile?.role ?? null}>
      <LoadingBar />
      <div className="flex min-h-screen">
        <DashboardSidebar
          role={profile?.role ?? null}
          fullName={profile?.full_name ?? null}
          userEmail={user.email ?? null}
          userId={user.id}
        />
        <CorridorProvider defaultCorridorId={profile?.assigned_corridor_id ?? null}>
          <main className="flex-1 overflow-y-auto">
            {/* ── Ambient background glows — decorative page atmosphere ──
                Viewport-fixed so they don't scroll with the content, and at a
                negative z-index so they sit behind every element (cards, top
                bar and sidebar all paint above them). Primary purple glow in
                the top-right, lighter secondary accent in the bottom-left. */}
            <div
              aria-hidden="true"
              className="pointer-events-none fixed -right-40 -top-40 -z-10 h-[640px] w-[640px] rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, hsl(var(--primary) / 0.05) 0%, hsl(var(--primary) / 0) 70%)",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none fixed -bottom-32 -left-32 -z-10 h-[400px] w-[400px] rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, hsl(270 90% 72% / 0.03) 0%, hsl(270 90% 72% / 0) 70%)",
              }}
            />
            <DashboardTopBar />
            <div className="page-container py-6">{children}</div>
            {/* Chart gradient definitions - shared across all dashboard pages */}
            <div className="chart-gradients" aria-hidden="true">
              <svg>
                <defs>
                  <linearGradient id="chart-gradient-primary" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--primary-active))" />
                  </linearGradient>
                  <linearGradient id="chart-gradient-primary-vertical" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--primary) / 0.7)" />
                  </linearGradient>
                  <linearGradient id="chart-gradient-primary-hover" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary) / 0.85)" />
                    <stop offset="100%" stopColor="hsl(var(--primary-active) / 0.9)" />
                  </linearGradient>
                  <linearGradient id="chart-gradient-card" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--surface-1))" />
                    <stop offset="100%" stopColor="hsl(var(--surface-2))" />
                  </linearGradient>
                  <linearGradient id="chart-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="hsl(var(--primary) / 0)" />
                    <stop offset="50%" stopColor="hsl(var(--primary) / 0.4)" />
                    <stop offset="100%" stopColor="hsl(var(--primary) / 0)" />
                  </linearGradient>
                  <linearGradient id="chart-gradient-success" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--success))" />
                    <stop offset="100%" stopColor="hsl(var(--success) / 0.7)" />
                  </linearGradient>
                  <linearGradient id="chart-gradient-warning" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--warning))" />
                    <stop offset="100%" stopColor="hsl(var(--warning) / 0.7)" />
                  </linearGradient>
                  <linearGradient id="chart-gradient-destructive" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" />
                    <stop offset="100%" stopColor="hsl(var(--destructive) / 0.7)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </main>
        </CorridorProvider>
      </div>
    </OnboardingWrapper>
  );
}