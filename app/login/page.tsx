"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getDashboardRouteForRole } from "@/lib/roles";
import { Lock, Loader2, Mail, TrainFront } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );

  

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isLoading) return;

    setIsLoading(true);
    const supabase = createClient();

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError || !data.user) {
      toast.error(signInError?.message || "Failed to sign in");
      setIsLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile?.role) {
      toast.error("Failed to fetch user profile");
      setIsLoading(false);
      return;
    }

    const route = getDashboardRouteForRole(profile.role);
    if (route === "/login") {
      toast.error("Unrecognized user role");
      setIsLoading(false);
      return;
    }

    toast.success("Signed in successfully");
    router.replace(route);
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Left brand panel — desktop only */}
      <aside className="relative isolate hidden overflow-hidden bg-gradient-primary lg:flex lg:flex-col">
        {/* Dot-grid texture — small white dots at 8% on a 24px grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid"
        />
        {/* Soft blurred glow in the bottom corner */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-[400px] w-[400px] rounded-full bg-[hsl(270_90%_72%)] opacity-10 blur-3xl"
        />

        <div className="flex flex-1 flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <TrainFront className="h-5 w-5" />
            </span>
            <span className="font-heading text-xl font-bold">RailSync</span>
          </div>

          <div>
            <h2 className="max-w-md text-3xl font-bold tracking-tight leading-tight font-heading text-primary-foreground">
              Unified rail operations, from defect to delivery.
            </h2>
            <p className="mt-4 max-w-md text-sm text-primary-foreground/80">
              Defect tracking, AI-powered block-request scoring, live control, and
              field execution — all in one place.
            </p>
          </div>
        </div>
      </aside>

      <Card className="m-auto w-full max-w-md shadow-xl">
        <CardHeader className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <TrainFront className="h-6 w-6" />
            </div>
            <span className="text-xl font-semibold text-foreground">RailSync</span>
          </div>
          <div className="space-y-1 text-center">
            <CardTitle className="text-2xl">Welcome to RailSync</CardTitle>
            <CardDescription>
              Enter your email and password to sign in
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="email"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-8"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  autoComplete="email"
                />
              </div>
              {errors.email && (
                <p
                  className="text-xs text-destructive"
                  id="email-error"
                >
                  {errors.email}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="&#xb7;&#xb7;&#xb7;&#xb7;&#xb7;&#xb7;&#xb7;&#xb7;&#xb7;&#xb7;"
                  className="pl-8"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  autoComplete="current-password"
                />
              </div>
              {errors.password && (
                <p
                  className="text-xs text-destructive"
                  id="password-error"
                >
                  {errors.password}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
