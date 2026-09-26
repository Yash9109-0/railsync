"use client";

import * as React from "react";

interface SuccessCheckmarkProps {
  size?: number;
  strokeWidth?: number;
  circleColor?: string;
  checkColor?: string;
  animationDuration?: number;
  holdDuration?: number;
  onComplete?: () => void;
}

export function SuccessCheckmark({
  size = 48,
  strokeWidth = 3,
  circleColor = "hsl(var(--primary))",
  checkColor = "hsl(var(--primary-foreground))",
  animationDuration = 400,
  holdDuration = 800,
  onComplete,
}: SuccessCheckmarkProps) {
  const [animate, setAnimate] = React.useState(false);

  React.useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => {
      onComplete?.();
    }, animationDuration + holdDuration);
    return () => clearTimeout(timer);
  }, [animationDuration, holdDuration, onComplete]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const checkPathLength = size * 0.55;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={circleColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        strokeLinecap="round"
        style={{
          transition: `stroke-dashoffset ${animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          strokeDashoffset: animate ? 0 : circumference,
        }}
      />
      <path
        d={`M${size * 0.22} ${size * 0.5} L${size * 0.44} ${size * 0.68} L${size * 0.78} ${size * 0.32}`}
        fill="none"
        stroke={checkColor}
        strokeWidth={strokeWidth * 1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={checkPathLength}
        strokeDashoffset={checkPathLength}
        style={{
          transition: `stroke-dashoffset ${animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1) ${animationDuration * 0.3}ms`,
          strokeDashoffset: animate ? 0 : checkPathLength,
        }}
      />
    </svg>
  );
}

interface SuccessOverlayProps {
  open: boolean;
  onClose: () => void;
  message?: string;
  size?: number;
}

export function SuccessOverlay({
  open,
  onClose,
  message = "Approved",
  size = 56,
}: SuccessOverlayProps) {
  const [showCheckmark, setShowCheckmark] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setShowCheckmark(true);
      const timer = setTimeout(() => {
        setShowCheckmark(false);
        onClose();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [open, onClose]);

  if (!showCheckmark) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm"
      onClick={onClose}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex flex-col items-center gap-3 rounded-xl bg-popover p-6 shadow-xl border"
        onClick={(e) => e.stopPropagation()}
      >
        <SuccessCheckmark size={size} onComplete={() => {}} />
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
}