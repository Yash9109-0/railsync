import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bot, Compass, Gauge, TrainFront, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewCard {
  title: string;
  description: string;
  icon: LucideIcon;
  role: string;
  featured?: boolean;
}

const PREVIEW_CARDS: PreviewCard[] = [
  {
    title: "AI",
    description: "AI scoring and safety-blocked requests.",
    icon: Bot,
    role: "AI",
    featured: true,
  },
  {
    title: "Maintenance",
    description: "Log defects and request track blocks for maintenance work.",
    icon: Wrench,
    role: "Maintenance",
  },
  {
    title: "Control",
    description: "Live timetable and block request approvals.",
    icon: Gauge,
    role: "Control",
  },
  {
    title: "Field",
    description: "Start approved field work and review execution performance.",
    icon: Compass,
    role: "Field",
  },
];

interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: "4", label: "Departments Unified" },
  { value: "5", label: "Stations per Corridor" },
  { value: "10-Second", label: "AI Scoring" },
  { value: "24/7", label: "Automated Monitoring" },
];

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Product",
    links: [
      { label: "Dashboards", href: "/login" },
      { label: "Features", href: "#" },
    ],
  },
  {
    heading: "Team",
    links: [
      { label: "About", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "#" },
      {
        label: "GitHub",
        href: "https://github.com/Yash9109-0/railsync",
        external: true,
      },
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <main className="mx-auto w-full max-w-6xl flex-1">
        <section className="relative isolate overflow-hidden flex flex-col items-center px-6 py-24 lg:py-32 text-center">
          {/* Floating decorative glows — blurred primary/accent circles that add
              depth behind the hero. `isolate` + negative z-index keeps them above
              the page gradient but beneath the copy, and `overflow-hidden` stops
              them from spilling past the section edges. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-primary opacity-[0.08] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-1/2 -z-10 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-[hsl(270_90%_72%)] opacity-[0.07] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 -left-16 -z-10 h-56 w-56 rounded-full bg-primary opacity-5 blur-3xl"
          />
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl lg:h-20 lg:w-20 lg:rounded-3xl lg:shadow-2xl">
            <TrainFront className="h-8 w-8 lg:h-10 lg:w-10" />
          </div>
          <h1 className="mt-8 text-5xl font-bold tracking-tight leading-tight font-heading lg:text-6xl lg:mt-10">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              RailSync
            </span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground lg:text-xl lg:mt-10">
            A unified rail-network operations hub for defect tracking, AI-powered
            block-request scoring, live control, and field execution — all in
            one place.
          </p>
          <Button asChild size="lg" className="mt-10 lg:mt-12">
            <Link href="/login">Sign in to your dashboard</Link>
          </Button>
        </section>

        <section className="px-6 py-16 lg:py-24" aria-hidden="true">
          <div className="mx-auto max-w-4xl">
            <Image
              src="/illustrations/landing-hero.svg"
              alt="Railway team collaboration"
              width={400}
              height={208}
              className="mx-auto"
              priority={false}
            />
          </div>
        </section>

        {/* Stats strip — scale/credibility numbers bridging the hero and the previews */}
        <section className="px-6 pb-16 lg:pb-24">
          <h2 className="text-center text-xl font-semibold tracking-tight">
            Built for Scale
          </h2>
          <div className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-8 lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold tabular-nums font-heading">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 pb-24 lg:pb-32">
          <h2 className="text-center text-xl font-semibold tracking-tight">
            Dashboard previews
          </h2>
          <div className="mx-auto mt-8 grid max-w-5xl gap-6 lg:grid-cols-4">
            {PREVIEW_CARDS.map((card) => {
              const Icon = card.icon;
              const isFeatured = card.featured;
              return (
                <Card
                  key={card.title}
                  className={cn(
                    "group transition-[box-shadow,transform] duration-fast",
                    isFeatured
                      ? "lg:col-span-2 hover:shadow-xl hover:-translate-y-1.5 shadow-lg"
                      : "hover:shadow-md hover:-translate-y-1"
                  )}
                >
                  <CardHeader className={cn(isFeatured && "pb-6")}>
                    <div className={cn(
                      "mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-icon-primary text-primary transition-transform duration-fast group-hover:scale-105",
                      isFeatured && "lg:h-12 lg:w-12 rounded-2xl"
                    )}>
                      <Icon className={cn("h-5 w-5", isFeatured && "lg:h-6 lg:w-6")} />
                    </div>
                    <CardTitle className={cn(isFeatured && "text-lg lg:text-xl")}>
                      {card.title}
                    </CardTitle>
                    <CardDescription className={cn(isFeatured && "text-base")}>
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Link
                      href="/login"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open {card.role} dashboard
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-14 lg:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2">
              {/* Logo mark — mirrors the hero's primary tile + gradient wordmark */}
              <Link href="/" className="inline-flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <TrainFront className="h-5 w-5" />
                </span>
                <span className="bg-gradient-primary bg-clip-text font-heading text-lg font-bold text-transparent">
                  RailSync
                </span>
              </Link>
              <p className="mt-4 text-sm text-muted-foreground">
                Unified rail operations, from defect to delivery.
              </p>
            </div>

            {FOOTER_COLUMNS.map((column) => (
              <div key={column.heading}>
                <h3 className="text-sm font-semibold">{column.heading}</h3>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <Separator className="my-10" />

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} RailSync. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
