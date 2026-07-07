import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 36px padding (default, per prompt.md for most onboarding speech/selection cards). */
  padding?: "default" | "spacious" | "none";
  /** Heavier ambient elevation used by welcome/confidence/ai-plan/dashboard cards. */
  shadow?: "ambient" | "hero";
}

const PADDING_CLASSES: Record<NonNullable<CardProps["padding"]>, string> = {
  default: "p-9 max-md:p-6",
  spacious: "p-12 max-md:p-6",
  none: "",
};

const SHADOW_CLASSES: Record<NonNullable<CardProps["shadow"]>, string> = {
  ambient: "shadow-card-ambient",
  hero: "shadow-card-hero",
};

/**
 * The floating white surface every screen in the handoff is built on.
 * Radius/shadow/padding are the only opinions this component holds —
 * layout is entirely up to the caller.
 */
export function Card({
  padding = "default",
  shadow = "ambient",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card bg-bg-card",
        PADDING_CLASSES[padding],
        SHADOW_CLASSES[shadow],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
