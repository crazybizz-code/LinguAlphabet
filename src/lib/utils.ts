import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class lists safely — clsx for conditional composition,
 * tailwind-merge to resolve conflicting utility classes (e.g. a caller
 * overriding a component's default padding).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
