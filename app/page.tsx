import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardRouteForRole } from "@/lib/roles";

export default async function Home() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;
  const userRoute = getDashboardRouteForRole(role);

  redirect(userRoute);
}