import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getDashboardRouteForRole, isAdminRole } from "./lib/roles";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;
  const userRoute = getDashboardRouteForRole(role);

  if (userRoute === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const segments = pathname.split("/").filter(Boolean);
  const dashboardSegment = segments[1];

  if (isAdminRole(role)) {
    if (!dashboardSegment) {
      const url = request.nextUrl.clone();
      url.pathname = userRoute;
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const currentRoute = dashboardSegment
    ? `/dashboard/${dashboardSegment}`
    : "/dashboard";

  if (currentRoute !== userRoute) {
    const url = request.nextUrl.clone();
    url.pathname = userRoute;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
