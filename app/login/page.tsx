"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getDashboardRouteForRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Wrench,
} from "lucide-react";

const REMEMBER_KEY = "railsync.remembered-email";
const EMAIL_PATTERN = /\S+@\S+\.\S+/;
const RAIL_ROUTE = "M -80 520 C 140 470, 240 330, 400 330 C 560 330, 620 190, 900 130";

const FEATURES = [
  { icon: Activity, label: "Real-time defect tracking" },
  { icon: Sparkles, label: "AI-powered scoring" },
  { icon: Wrench, label: "Field execution tools" },
];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const leftContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};
const leftItem: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};
const formContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } },
};
const formItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const FLOATING_DOTS = [
  { left: "14%", top: "26%", size: 6, duration: 7, delay: 0, opacity: 0.5 },
  { left: "30%", top: "62%", size: 4, duration: 9, delay: 1.2, opacity: 0.4 },
  { left: "56%", top: "18%", size: 5, duration: 8, delay: 0.6, opacity: 0.45 },
  { left: "72%", top: "48%", size: 4, duration: 10, delay: 2, opacity: 0.35 },
  { left: "42%", top: "80%", size: 5, duration: 8.5, delay: 1.6, opacity: 0.4 },
];

export default function LoginPage() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [shakeCard, setShakeCard] = useState(false);
  const [focusField, setFocusField] = useState<"email" | "password" | null>(null);
  const reducedMotion = useReducedMotion();

  const emailInvalid = !!(touched.email && errors.email);
  const passwordInvalid = !!(touched.password && errors.password);

  /* Pointer-driven parallax for the brand panel background layers */
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 50, damping: 20, mass: 1 });
  const springY = useSpring(pointerY, { stiffness: 50, damping: 20, mass: 1 });
  const dotsX = useTransform(springX, (v) => v * -26);
  const dotsY = useTransform(springY, (v) => v * -18);
  const glowX = useTransform(springX, (v) => v * -48);
  const glowY = useTransform(springY, (v) => v * -34);
  const railX = useTransform(springX, (v) => v * -10);
  const railY = useTransform(springY, (v) => v * -7);
  const heroX = useTransform(springX, (v) => v * 9);
  const heroY = useTransform(springY, (v) => v * 6);

  useEffect(() => {
    document.title = "Sign in · RailSync";
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    } catch {
      // storage unavailable — proceed without persistence
    }
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerX.set((e.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handlePointerLeave = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) {
      newErrors.email = "Email is required";
    } else if (!EMAIL_PATTERN.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    setErrors(newErrors);
    setTouched({ email: true, password: true });
    if (newErrors.email) emailRef.current?.focus();
    else if (newErrors.password) passwordRef.current?.focus();
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: "email" | "password") => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === "email" && email) {
      const emailError = !EMAIL_PATTERN.test(email) ? "Please enter a valid email address" : undefined;
      setErrors((prev) => ({ ...prev, email: emailError }));
    }
    if (field === "password" && password && password.length < 6) {
      setErrors((prev) => ({ ...prev, password: "Password must be at least 6 characters" }));
    }
    if (field === "password") setCapsLockOn(false);
  };

  const handleChange = (field: "email" | "password", value: string) => {
    if (field === "email") setEmail(value);
    else setPassword(value);
    if (touched[field] && errors[field]) {
      if (field === "email" && value && EMAIL_PATTERN.test(value)) {
        setErrors((prev) => ({ ...prev, email: undefined }));
      }
      if (field === "password" && value && value.length >= 6) {
        setErrors((prev) => ({ ...prev, password: undefined }));
      }
    }
  };

  const handlePasswordKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState?.("CapsLock") ?? false);
  };

  const handleRememberToggle = (checked: boolean) => {
    setRememberMe(checked);
    try {
      if (checked && email && EMAIL_PATTERN.test(email)) {
        window.localStorage.setItem(REMEMBER_KEY, email);
      } else {
        window.localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      // storage unavailable — keep in-memory state only
    }
  };

  const togglePasswordVisibility = () => {
    const el = passwordRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    setShowPassword((prev) => !prev);
    requestAnimationFrame(() => {
      el?.setSelectionRange(start, end);
    });
  };

  const handleForgotPassword = async () => {
    if (isResetting || isLoading) return;
    if (!email || !EMAIL_PATTERN.test(email)) {
      setTouched((prev) => ({ ...prev, email: true }));
      setErrors((prev) => ({
        ...prev,
        email: !email
          ? "Enter your email address above and we'll send a reset link"
          : "Please enter a valid email address",
      }));
      emailRef.current?.focus();
      return;
    }
    setIsResetting(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setIsResetting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("If that address is registered, a password reset link is on its way.");
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
      setShakeCard(true);
      passwordRef.current?.focus();
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

    if (rememberMe) {
      try {
        window.localStorage.setItem(REMEMBER_KEY, email);
      } catch {
        // storage unavailable
      }
    }

    toast.success("Signed in successfully");
    router.replace(route);
  };

  return (
    <div className="grid h-dvh overflow-hidden bg-background lg:grid-cols-2">
      {/* ── Left brand panel — desktop only ─────────────────────────────── */}
      <aside
        className="relative isolate hidden overflow-hidden lg:flex lg:flex-col"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          {/* Animated base gradient — slow drift adds depth */}
          <div className="absolute inset-0 -z-40 bg-[linear-gradient(160deg,hsl(266_94%_58%),hsl(272_90%_44%)_45%,hsl(282_85%_26%))] animate-bg-pan" />
          {/* Top-left light wash */}
          <div className="absolute inset-0 -z-30 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.16),transparent_55%)]" />
          {/* Vignette — darkens edges for depth */}
          <div className="absolute inset-0 -z-30 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(24,0,48,0.38))]" />
          {/* Dot-grid texture */}
          <div className="absolute inset-0 -z-30 bg-dot-grid opacity-70" />
          {/* Parallax dot layer with floating dots */}
          <motion.div style={{ x: dotsX, y: dotsY }} className="absolute -inset-8 -z-30 bg-dot-grid">
            {FLOATING_DOTS.map((dot, i) => (
              <motion.span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: dot.left,
                  top: dot.top,
                  width: dot.size,
                  height: dot.size,
                  opacity: dot.opacity,
                }}
                animate={
                  reducedMotion
                    ? {}
                    : {
                        y: [0, -16, 0],
                        opacity: [dot.opacity * 0.55, dot.opacity, dot.opacity * 0.55],
                      }
                }
                transition={{
                  duration: dot.duration,
                  delay: dot.delay,
                  ease: "easeInOut",
                  repeat: Infinity,
                }}
              />
            ))}
          </motion.div>
          {/* Ambient blobs — deeper parallax layer */}
          <motion.div style={{ x: glowX, y: glowY }} className="absolute inset-0 -z-20">
            <div className="absolute -top-28 -right-20 h-96 w-96 rounded-full bg-fuchsia-400/25 blur-3xl animate-blob-float" />
            <div className="absolute -bottom-40 -left-28 h-72 w-72 rounded-full bg-indigo-300/25 blur-3xl animate-blob-float animation-delay-200" />
            <div className="absolute top-1/3 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-purple-300/20 blur-3xl animate-blob-float animation-delay-600" />
          </motion.div>
        </motion.div>

        {/* Animated rail route — gentle parallax */}
        <motion.div aria-hidden="true" style={{ x: railX, y: railY }} className="absolute inset-0 -z-10">
          <svg className="h-full w-full" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice">
            <path
              d={RAIL_ROUTE}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d={RAIL_ROUTE}
              fill="none"
              stroke="rgba(255,255,255,0.30)"
              strokeWidth="1.5"
            />
            <path
              className="animate-rail-dash"
              d={RAIL_ROUTE}
              fill="none"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.5"
              strokeDasharray="8 28"
            />
            {/* Station markers */}
            <circle cx="140" cy="455" r="3.5" fill="rgba(255,255,255,0.45)" />
            <circle cx="390" cy="331" r="3.5" fill="rgba(255,255,255,0.45)" />
            <circle cx="585" cy="235" r="3.5" fill="rgba(255,255,255,0.45)" />
            {/* Moving train marker */}
            <g className="rail-motion">
              <circle r="9" fill="rgba(255,255,255,0.22)">
                <animateMotion
                  dur="11s"
                  repeatCount="indefinite"
                  path={RAIL_ROUTE}
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="spline"
                  keySplines="0.45 0 0.55 1"
                />
              </circle>
              <circle r="3.5" fill="#fff">
                <animateMotion
                  dur="11s"
                  repeatCount="indefinite"
                  path={RAIL_ROUTE}
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="spline"
                  keySplines="0.45 0 0.55 1"
                />
              </circle>
            </g>
          </svg>
        </motion.div>

        <motion.div
          variants={leftContainer}
          initial="hidden"
          animate="show"
          className="relative flex flex-1 flex-col p-12 text-primary-foreground"
        >
          {/* Brand */}
          <motion.div variants={leftItem} className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <TrainFront className="h-6 w-6" />
            </span>
            <span className="font-heading text-xl font-bold tracking-tight">RailSync</span>
          </motion.div>

          {/* Hero — vertically centred, counter-parallax */}
          <motion.div style={{ x: heroX, y: heroY }} className="flex flex-1 items-center py-10">
            <div className="max-w-xl">
              <motion.span
                variants={leftItem}
                className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/20 backdrop-blur-sm"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                </span>
                Live operations platform
              </motion.span>
              <motion.h1
                variants={leftItem}
                className="font-heading text-3xl font-bold leading-tight tracking-tight text-balance text-white"
              >
                Unified rail operations, from defect to delivery.
              </motion.h1>
              <motion.p
                variants={leftItem}
                className="mt-4 max-w-md text-base leading-relaxed text-white/80"
              >
                Defect tracking, AI-powered block-request scoring, live control, and
                field execution — all in one place.
              </motion.p>
            </div>
          </motion.div>

          {/* Feature pills — glassmorphism + hover lift */}
          <div className="flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <motion.span
                key={label}
                variants={leftItem}
                whileHover={reducedMotion ? undefined : { y: -3, scale: 1.03 }}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                transition={{ type: "spring", stiffness: 350, damping: 22 }}
                className="inline-flex cursor-default items-center gap-2 rounded-full bg-gradient-to-b from-white/15 to-white/5 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-black/10 ring-1 ring-inset ring-white/20 backdrop-blur-md transition-shadow duration-fast hover:ring-white/35"
              >
                <Icon className="h-4 w-4 text-white/80" />
                {label}
              </motion.span>
            ))}
          </div>
        </motion.div>
      </aside>

      {/* ── Right form panel ────────────────────────────────────────────── */}
      <main className="relative isolate flex min-w-0 flex-col items-center justify-center overflow-y-auto bg-muted px-6 py-12 sm:px-10">
        {/* Soft brand washes */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-64 w-[560px] max-w-full -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-72 w-72 rounded-full bg-primary/5 blur-3xl"
        />

        {/* Mobile brand header */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-8 flex flex-col items-center gap-2 lg:hidden"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-lg shadow-primary/30">
              <TrainFront className="h-6 w-6" />
            </span>
            <span className="font-heading text-xl font-bold tracking-tight">RailSync</span>
          </div>
          <p className="text-sm text-muted-foreground">
            From defect to delivery — sign in to continue
          </p>
        </motion.div>

        <div
          className={cn("w-full max-w-sm", shakeCard && "animate-shake")}
          onAnimationEnd={(e) => {
            if (e.animationName === "shake") setShakeCard(false);
          }}
        >
          {/* Card entry — scale + fade */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <motion.div variants={formContainer} initial="hidden" animate="show">
              <Card className="relative w-full max-w-sm gap-0 py-0 shadow-xl">
                {/* Top accent hairline */}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
                />

                {/* Header */}
                <div className="px-8 pt-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <motion.div
                      initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.45, type: "spring", stiffness: 300, damping: 18 }}
                      className="relative"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 rounded-2xl bg-primary/25 blur-lg"
                      />
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-lg shadow-primary/30">
                        <TrainFront className="h-6 w-6" />
                      </div>
                    </motion.div>
                  </div>
                  <motion.div variants={formItem} className="space-y-1.5">
                    <CardTitle className="text-2xl">Welcome back</CardTitle>
                    <CardDescription>
                      Enter your credentials to access your dashboard
                    </CardDescription>
                  </motion.div>
                </div>

                {/* Form */}
                <CardContent className="px-8 pt-6 pb-8">
                  <form onSubmit={handleSubmit} className="space-y-5" noValidate aria-busy={isLoading}>
                    {/* Email */}
                    <motion.div variants={formItem} className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium leading-none">
                        Email address
                      </Label>
                      <motion.div
                        animate={{ scale: focusField === "email" ? 1.01 : 1 }}
                        transition={{ type: "spring", stiffness: 320, damping: 26 }}
                        className={cn(
                          "group relative rounded-xl transition-all duration-fast",
                          "focus-within:ring-2 focus-within:ring-primary/30 focus-within:shadow-lg focus-within:shadow-primary/20",
                          emailInvalid &&
                            "focus-within:ring-destructive/30 focus-within:shadow-destructive/10"
                        )}
                      >
                        <Mail
                          className={cn(
                            "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-fast",
                            emailInvalid
                              ? "text-destructive"
                              : "text-muted-foreground group-focus-within:text-primary"
                          )}
                        />
                        <Input
                          ref={emailRef}
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          className="h-11 pl-10 bg-surface-1 dark:bg-surface-3/50"
                          value={email}
                          onChange={(e) => handleChange("email", e.target.value)}
                          onFocus={() => setFocusField("email")}
                          onBlur={() => {
                            setFocusField(null);
                            handleBlur("email");
                          }}
                          aria-invalid={!!(touched.email && errors.email)}
                          aria-describedby={touched.email && errors.email ? "email-error" : undefined}
                          autoComplete="email"
                          autoFocus
                          disabled={isLoading}
                        />
                      </motion.div>
                      {touched.email && errors.email && (
                        <p
                          role="alert"
                          id="email-error"
                          className="flex items-center gap-1.5 text-xs font-medium text-destructive animate-error-in"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          {errors.email}
                        </p>
                      )}
                    </motion.div>

                    {/* Password */}
                    <motion.div variants={formItem} className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-medium leading-none">
                        Password
                      </Label>
                      <motion.div
                        animate={{ scale: focusField === "password" ? 1.01 : 1 }}
                        transition={{ type: "spring", stiffness: 320, damping: 26 }}
                        className={cn(
                          "group relative rounded-xl transition-all duration-fast",
                          "focus-within:ring-2 focus-within:ring-primary/30 focus-within:shadow-lg focus-within:shadow-primary/20",
                          passwordInvalid &&
                            "focus-within:ring-destructive/30 focus-within:shadow-destructive/10"
                        )}
                      >
                        <Lock
                          className={cn(
                            "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-fast",
                            passwordInvalid
                              ? "text-destructive"
                              : "text-muted-foreground group-focus-within:text-primary"
                          )}
                        />
                        <Input
                          ref={passwordRef}
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="h-11 pl-10 pr-10 bg-surface-1 dark:bg-surface-3/50"
                          value={password}
                          onChange={(e) => handleChange("password", e.target.value)}
                          onFocus={() => setFocusField("password")}
                          onKeyDown={handlePasswordKey}
                          onKeyUp={handlePasswordKey}
                          onBlur={() => {
                            setFocusField(null);
                            handleBlur("password");
                          }}
                          aria-invalid={!!(touched.password && errors.password)}
                          aria-describedby={touched.password && errors.password ? "password-error" : undefined}
                          autoComplete="current-password"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={togglePasswordVisibility}
                          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          disabled={isLoading}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </motion.div>
                      {capsLockOn && !(touched.password && errors.password) && (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-warning animate-notice-in">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          Caps Lock is on
                        </p>
                      )}
                      {touched.password && errors.password && (
                        <p
                          role="alert"
                          id="password-error"
                          className="flex items-center gap-1.5 text-xs font-medium text-destructive animate-error-in"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          {errors.password}
                        </p>
                      )}
                    </motion.div>

                    {/* Remember + forgot */}
                    <motion.div variants={formItem} className="flex items-center justify-between">
                      <label className="group flex cursor-pointer items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => handleRememberToggle(e.target.checked)}
                          disabled={isLoading}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-all duration-fast peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 " +
                            (rememberMe
                              ? "border-primary bg-primary shadow-sm shadow-primary/30"
                              : "border-input bg-surface-1 group-hover:border-border-strong dark:bg-surface-3/50")
                          }
                        >
                          {rememberMe && (
                            <Check className="h-3 w-3 text-primary-foreground animate-pop-in" />
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground">Remember me</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={isResetting || isLoading}
                        className="text-xs font-medium text-primary transition-colors duration-fast hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-sm focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isResetting ? "Sending..." : "Forgot password?"}
                      </button>
                    </motion.div>

                    {/* Sign in + secure note */}
                    <motion.div variants={formItem} className="space-y-5">
                      <motion.div
                        whileHover={isLoading || reducedMotion ? undefined : { scale: 1.02 }}
                        whileTap={isLoading || reducedMotion ? undefined : { scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                      >
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isLoading}
                          size="lg"
                        >
                          <span aria-hidden="true" className="pointer-events-none absolute inset-0">
                            <span className="absolute inset-y-0 left-0 w-full -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover/button:translate-x-[300%]" />
                          </span>
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Signing in...
                            </>
                          ) : (
                            <>
                              Sign in
                              <ArrowRight className="transition-transform duration-fast group-hover/button:translate-x-0.5" />
                            </>
                          )}
                        </Button>
                      </motion.div>
                      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 text-success" />
                        Your credentials are encrypted in transit
                      </p>
                    </motion.div>
                  </form>
                </CardContent>

                <CardFooter className="border-t bg-surface-3/50 px-8 py-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <span className="font-medium text-foreground">Contact your administrator</span>
                  </p>
                </CardFooter>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
