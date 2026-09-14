import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bot, Compass, Gauge, TrainFront, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewCard {
  title: string;
  description: string;
  icon: LucideIcon;
  role: string;
}

const PREVIEW_CARDS: PreviewCard[] = [
  {
    title: "Maintenance",
    description: "Log defects and request track blocks for maintenance work.",
    icon: Wrench,
    role: "Maintenance",
  },
  {
    title: "AI",
    description: "AI scoring and safety-blocked requests.",
    icon: Bot,
    role: "AI",
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

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-primary/8 via-background to-background">
      <main className="mx-auto w-full max-w-6xl flex-1">
        <section className="flex flex-col items-center px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <TrainFront className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            <span className="text-transparent bg-gradient-to-r from-primary via-primary-active to-primary bg-clip-text">
              RailSync
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            A unified rail-network operations hub for defect tracking, AI-powered
            block-request scoring, live control, and field execution — all in
            one place.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/login">Sign in to your dashboard</Link>
          </Button>
        </section>

        <section className="px-6 pb-16">
          <h2 className="text-center text-xl font-semibold tracking-tight">
            Dashboard previews
          </h2>
          <div className="mx-auto mt-8 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PREVIEW_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.title}
                  className={cn(
                    "group transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
                  )}
                >
                  <CardHeader>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle>{card.title}</CardTitle>
                    <CardDescription>{card.description}</CardDescription>
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
    </div>
  );
}
