"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, Check, HelpCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type UserRole = "admin" | "maintenance" | "control" | "field";

interface TourStep {
  id: string;
  selector: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
  action?: () => void;
}

interface OnboardingTourProps {
  userId: string;
  role: UserRole;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const TOUR_STORAGE_KEY = (userId: string) => `onboarded_${userId}`;
const TOUR_STEP_STORAGE_KEY = (userId: string) => `onboarded_step_${userId}`;

const MAINTENANCE_STEPS: TourStep[] = [
  {
    id: "combined-form",
    selector: '[data-tour="combined-form"]',
    title: "Log Defect & Request Block",
    description: "This combined form lets you log a defect and optionally request a track block in a single action. Fill in the details and submit to send it for AI scoring.",
    position: "bottom",
  },
  {
    id: "defect-register",
    selector: '[data-tour="defect-register-tab"]',
    title: "Defect Register",
    description: "View all tracked defects here. Defects with linked block requests show AI priority scores. Click 'Request Block Now' on open defects to create a block request.",
    position: "bottom",
  },
  {
    id: "my-requests",
    selector: '[data-tour="my-requests-tab"]',
    title: "My Requests",
    description: "See all your submitted block requests with their status. Click a scored request to view AI-generated plan options with explanations.",
    position: "bottom",
  },
];

const CONTROL_STEPS: TourStep[] = [
  {
    id: "corridor-switcher",
    selector: '[data-tour="corridor-switcher"]',
    title: "Corridor Switcher",
    description: "Select a corridor to filter all views — timetable, pending plans, and field work — to that corridor's segments.",
    position: "bottom",
  },
  {
    id: "pending-plans",
    selector: '[data-tour="pending-plans-tab"]',
    title: "Pending Plans",
    description: "Review AI-scored block requests awaiting approval. Select a plan option, then Approve, Modify & Approve, or Reject.",
    position: "bottom",
  },
  {
    id: "live-track-map",
    selector: '[data-tour="live-track-map"]',
    title: "Live Track Map",
    description: "Real-time view of train positions on the network. Auto-refreshes every 15 seconds. Use the Timetable tab for detailed schedule view.",
    position: "top",
  },
];

const FIELD_STEPS: TourStep[] = [
  {
    id: "start-work",
    selector: '[data-tour="start-work-btn"]',
    title: "Start Work",
    description: "Click 'Start Work' on an approved request to begin field execution. This logs the start time and moves the request to In Progress.",
    position: "top",
  },
  {
    id: "complete-work",
    selector: '[data-tour="complete-work-btn"]',
    title: "Complete Work",
    description: "When work is done, click 'Complete Work' to upload before/after photos, set the end time, and capture GPS location. This marks the request as executed.",
    position: "top",
  },
];

const ADMIN_STEPS: TourStep[] = [
  {
    id: "planning-tab",
    selector: '[data-tour="planning-tab"]',
    title: "Weekly/Monthly Planning",
    description: "Generate AI-optimized maintenance schedules for weekly or monthly horizons. The CP-SAT solver guarantees optimal track availability.",
    position: "bottom",
  },
  {
    id: "ai-priority-explanation",
    selector: '[data-tour="ai-priority-explanation"]',
    title: "How Does the AI Decide Priority?",
    description: "Expand this section to see the feature importance chart showing which factors (safety criticality, traffic density, urgency) drive the AI priority scoring model.",
    position: "bottom",
  },
];

function getStepsForRole(role: UserRole): TourStep[] {
  switch (role) {
    case "maintenance":
      return MAINTENANCE_STEPS;
    case "control":
      return CONTROL_STEPS;
    case "field":
      return FIELD_STEPS;
    case "admin":
      return ADMIN_STEPS;
    default:
      return MAINTENANCE_STEPS;
  }
}

function getRoleDisplayName(role: UserRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function OnboardingTour({
  userId,
  role,
  isOpen,
  onClose,
  onComplete,
}: OnboardingTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const steps = getStepsForRole(role);
  const currentStep = steps[currentStepIndex];
  const overlayRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  const updateTargetRect = useCallback(() => {
    if (!currentStep) return;
    const element = document.querySelector(currentStep.selector);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);

      const popoverWidth = 320;
      const popoverHeight = 180;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = rect.bottom + 12;
      let left = rect.left + rect.width / 2 - popoverWidth / 2;

      if (currentStep.position === "top") {
        top = rect.top - popoverHeight - 12;
      } else if (currentStep.position === "left") {
        top = rect.top + rect.height / 2 - popoverHeight / 2;
        left = rect.left - popoverWidth - 12;
      } else if (currentStep.position === "right") {
        top = rect.top + rect.height / 2 - popoverHeight / 2;
        left = rect.right + 12;
      } else if (currentStep.position === "center") {
        top = viewportHeight / 2 - popoverHeight / 2;
        left = viewportWidth / 2 - popoverWidth / 2;
      }

      if (left < 12) left = 12;
      if (left + popoverWidth > viewportWidth - 12) left = viewportWidth - popoverWidth - 12;
      if (top < 12) top = 12;
      if (top + popoverHeight > viewportHeight - 12) top = viewportHeight - popoverHeight - 12;

      setPopoverPosition({ top, left });
    } else {
      setTargetRect(null);
      setPopoverPosition({ top: window.innerHeight / 2 - 90, left: window.innerWidth / 2 - 160 });
    }
  }, [currentStep]);

  useEffect(() => {
    if (!isOpen) return;

    const stored = localStorage.getItem(TOUR_STEP_STORAGE_KEY(userId));
    if (stored) {
      const stepIndex = parseInt(stored, 10);
      if (stepIndex >= 0 && stepIndex < steps.length) {
        setCurrentStepIndex(stepIndex);
      }
    }

    updateTargetRect();
    const handleResize = () => updateTargetRect();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    observerRef.current = new MutationObserver(handleResize);
    observerRef.current.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      observerRef.current?.disconnect();
    };
  }, [isOpen, userId, currentStepIndex, steps.length, updateTargetRect]);

  useEffect(() => {
    if (isOpen && currentStep) {
      updateTargetRect();
    }
  }, [currentStepIndex, isOpen, updateTargetRect]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      localStorage.setItem(TOUR_STEP_STORAGE_KEY(userId), String(nextIndex));
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_STORAGE_KEY(userId), "true");
    localStorage.removeItem(TOUR_STEP_STORAGE_KEY(userId));
    onComplete();
    onClose();
  };

  if (!isOpen || !currentStep) return null;

  const overlayContent = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm pointer-events-none"
      aria-hidden="true"
    >
      {targetRect && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: "8px",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6), 0 0 0 2px hsl(var(--primary)), 0 0 20px hsl(var(--primary))",
            zIndex: 9999,
          }}
        />
      )}
    </div>
  );

  const popoverContent = (
    <div
      ref={popoverRef}
      className={cn(
        "fixed z-[10000] w-80 max-w-[90vw] pointer-events-auto animate-in fade-in zoom-in-95 duration-200",
        "rounded-xl border bg-popover text-popover-foreground shadow-xl"
      )}
      style={{
        top: popoverPosition.top,
        left: popoverPosition.left,
      }}
      role="dialog"
      aria-labelledby="tour-title"
      aria-describedby="tour-description"
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <h3 id="tour-title" className="font-semibold text-sm">
              {currentStep.title}
            </h3>
            <p id="tour-description" className="text-sm text-muted-foreground">
              {currentStep.description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkip}
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Skip tour"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={currentStepIndex + 1} aria-valuemin={1} aria-valuemax={steps.length} aria-label={`Step ${currentStepIndex + 1} of ${steps.length}`}>
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  index === currentStepIndex
                    ? "bg-primary w-6"
                    : index < currentStepIndex
                    ? "bg-primary w-4"
                    : "bg-muted w-4"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const prevIndex = currentStepIndex - 1;
                  setCurrentStepIndex(prevIndex);
                  localStorage.setItem(TOUR_STEP_STORAGE_KEY(userId), String(prevIndex));
                }}
                className="h-8"
              >
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="h-8"
            >
              {currentStepIndex === steps.length - 1 ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Finish
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {overlayContent}
      {popoverContent}
    </>,
    document.body
  );
}

interface OnboardingTriggerProps {
  userId: string;
  role: UserRole;
  children: React.ReactNode;
}

export function OnboardingTrigger({ userId, role, children }: OnboardingTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const completed = localStorage.getItem(TOUR_STORAGE_KEY(userId));
    setHasCompleted(completed === "true");

    if (!completed) {
      setTimeout(() => setIsOpen(true), 500);
    }
  }, [userId]);

  const handleClose = () => setIsOpen(false);
  const handleComplete = () => setHasCompleted(true);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <OnboardingTour
        userId={userId}
        role={role}
        isOpen={isOpen}
        onClose={handleClose}
        onComplete={handleComplete}
      />
      {hasCompleted && (
        <TourReplayButton userId={userId} role={role} onReplay={() => setIsOpen(true)} />
      )}
    </>
  );
}

function TourReplayButton({ userId, role, onReplay }: { userId: string; role: UserRole; onReplay: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onReplay}
      className="gap-1.5 text-xs"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      Show {getRoleDisplayName(role)} tour again
    </Button>
  );
}

export function useOnboardingTour(userId: string, role: UserRole) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const completed = localStorage.getItem(TOUR_STORAGE_KEY(userId));
    setHasCompleted(completed === "true");
  }, [userId]);

  const startTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY(userId));
    localStorage.removeItem(TOUR_STEP_STORAGE_KEY(userId));
    setHasCompleted(false);
    setIsOpen(true);
  }, [userId]);

  const closeTour = useCallback(() => setIsOpen(false), []);

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY(userId), "true");
    localStorage.removeItem(TOUR_STEP_STORAGE_KEY(userId));
    setHasCompleted(true);
    setIsOpen(false);
  }, [userId]);

  return {
    isOpen,
    hasCompleted,
    mounted,
    startTour,
    closeTour,
    completeTour,
    TourComponent: OnboardingTour,
    ReplayButton: TourReplayButton,
  };
}