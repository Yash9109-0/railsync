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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getDashboardRouteForRole } from "@/lib/roles";
import { Lock, Loader2, Mail, TrainFront, Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

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

  const handleBlur = (field: "email" | "password") => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === "email" && email) {
      const emailError = !/\S+@\S+\.\S+/.test(email) ? "Please enter a valid email address" : undefined;
      setErrors((prev) => ({ ...prev, email: emailError }));
    }
    if (field === "password" && password && password.length < 6) {
      setErrors((prev) => ({ ...prev, password: "Password must be at least 6 characters" }));
    }
  };

  const handleChange = (field: "email" | "password", value: string) => {
    if (field === "email") setEmail(value);
    else setPassword(value);
    if (touched[field] && errors[field]) {
      if (field === "email" && value && /\S+@\S+\.\S+/.test(value)) {
        setErrors((prev) => ({ ...prev, email: undefined }));
      }
      if (field === "password" && value && value.length >= 6) {
        setErrors((prev) => ({ ...prev, password: undefined }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isLoading) return;

    setIsLoading(true);
    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
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

  const inputClasses = (hasError: boolean) =>
    `pl-10 transition-all duration-fast ${
      hasError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""
    }`;

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
        {/* Animated orbiting accents */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-20 right-10 -z-10 h-32 w-32 rounded-full border border-white/10 animate-pulse-slow"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-20 left-20 -z-10 h-24 w-24 rounded-full border border-white/10 animate-pulse-slow animation-delay-1000"
        />

        <div className="flex flex-1 flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <TrainFront className="h-5 w-5" />
            </span>
            <span className="font-heading text-xl font-bold">RailSync</span>
          </div>

          <div className="animate-fade-in-up">
            <h2 className="max-w-md text-3xl font-bold tracking-tight leading-tight font-heading text-primary-foreground">
              Unified rail operations, from defect to delivery.
            </h2>
            <p className="mt-4 max-w-md text-sm text-primary-foreground/80">
              Defect tracking, AI-powered block-request scoring, live control, and
              field execution — all in one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 animate-fade-in-up animation-delay-200">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <CheckCircle2 className="h-3 w-3" />
              Real-time defect tracking
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <CheckCircle2 className="h-3 w-3" />
              AI-powered scoring
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <CheckCircle2 className="h-3 w-3" />
              Field execution tools
            </span>
          </div>
        </div>
      </aside>

      {/* Right form panel */}
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-xl animate-fade-in">
          <CardHeader className="space-y-6">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <TrainFront className="h-6 w-6" />
              </div>
              <span className="text-xl font-semibold text-foreground">RailSync</span>
            </div>
            <div className="space-y-1 text-center">
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>
                Enter your credentials to access your dashboard
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium leading-none">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className={inputClasses(!!(touched.email && errors.email))}
                    value={email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                    aria-invalid={!!(touched.email && errors.email)}
                    aria-describedby={touched.email && errors.email ? "email-error" : undefined}
                    autoComplete="email"
                    autoFocus
                    disabled={isLoading}
                  />
                </div>
                {touched.email && errors.email && (
                  <p className="flex items-center gap-1 text-xs text-destructive animate-shake" id="email-error">
                    <span className="h-3 w-3" />
                    {errors.email}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium leading-none">
                    Password
                  </Label>
                  <a
                    href="#"
                    className="text-xs text-primary hover:underline"
                    onClick={(e) => e.preventDefault()}
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className={inputClasses(!!(touched.password && errors.password))}
                    value={password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    onBlur={() => handleBlur("password")}
                    aria-invalid={!!(touched.password && errors.password)}
                    aria-describedby={touched.password && errors.password ? "password-error" : undefined}
                    autoComplete="current-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-fast"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {touched.password && errors.password && (
                  <p className="flex items-center gap-1 text-xs text-destructive animate-shake" id="password-error">
                    <span className="h-3 w-3" />
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-border-default text-primary focus:ring-primary focus:ring-offset-2"
                    aria-describedby="remember-me-desc"
                  />
                  <span id="remember-me-desc" className="text-sm text-muted-foreground">
                    Remember me
                  </span>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full min-h-12"
                disabled={isLoading}
                size="lg"
              >
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

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <a
                  href="#"
                  className="font-medium text-primary hover:underline"
                  onClick={(e) => e.preventDefault()}
                >
                  Contact your administrator
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}