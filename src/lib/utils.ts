import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Stock tailwind-merge has no knowledge of this project's custom
 * `--text-*` font-size scale (globals.css's `@theme`), so it couldn't tell
 * `text-body` (a size) apart from `text-text-primary` (a color) — both
 * looked like unrecognized "text" utilities in the same conflict group, so
 * combining them silently dropped whichever came first (e.g. Button/
 * Checkbox lost their font-size class entirely). Registering the scale
 * under the built-in "font-size" group keeps it separate from "text-color"
 * so both survive, while same-group overrides (a caller passing a
 * different size or color) still correctly dedupe.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["hero", "heading", "display", "h1", "h2", "h3", "body", "small", "caption", "badge"] }],
    },
  },
});

/**
 * Merge Tailwind class lists safely — clsx for conditional composition,
 * tailwind-merge to resolve conflicting utility classes (e.g. a caller
 * overriding a component's default padding).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
