import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardTopBar } from "@/components/dashboard-top-bar";
import { CorridorProvider } from "@/context/CorridorContext";
export const dynamic = "force-dynamic";
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
    <div className="flex min-h-screen">
      <DashboardSidebar
        role={profile?.role ?? null}
        fullName={profile?.full_name ?? null}
        userEmail={user.email ?? null}
      />
      <CorridorProvider>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      <CorridorProvider defaultCorridorId={profile?.assigned_corridor_id ?? null}>
        <main className="flex-1 overflow-y-auto">
          <DashboardTopBar />
          <div className="page-container py-6">{children}</div>
        </main>
      </CorridorProvider>
    </div>
  );
}