import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTimeAwareGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

const AVATAR_COLORS = [
  "bg-[#960DF2]", // Primary purple
  "bg-[#7C3AED]", // Violet
  "bg-[#06B6D4]", // Cyan
  "bg-[#10B981]", // Emerald
  "bg-[#F59E0B]", // Amber
  "bg-[#EF4444]", // Red
  "bg-[#EC4899]", // Pink
  "bg-[#F97316]", // Orange
  "bg-[#8B5CF6]", // Purple
  "bg-[#14B8A6]", // Teal
  "bg-[#6366F1]", // Indigo
  "bg-[#D946EF]", // Fuchsia
]

export function getAvatarColorFromId(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
