"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Stretch to fill the width of its container. */
  block?: boolean;
  /** Show the trailing arrow icon used by every primary CTA in the handoff. */
  arrow?: boolean;
  /** Replace the label with a spinner and disable interaction. */
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-text-on-primary shadow-glow hover:bg-primary-dark disabled:bg-primary/40 disabled:shadow-none",
  secondary:
    "bg-bg-card text-text-primary border border-border hover:border-primary disabled:opacity-40",
  ghost:
    "bg-transparent text-text-primary hover:bg-black/[0.03] disabled:opacity-40",
};

const ArrowIcon = () => (
  <svg
    className="ml-2 h-[18px] w-[18px] transition-transform duration-150 group-hover:translate-x-1"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M4 10h12M11 5l5 5-5 5"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Spinner = () => (
  <svg
    className="h-5 w-5 animate-spin"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    <circle
      cx="10"
      cy="10"
      r="8"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeOpacity={0.25}
    />
    <path
      d="M18 10a8 8 0 0 0-8-8"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Shared primary/secondary/ghost button — 56px touch target, soft shadow,
 * hover-lift + press-scale physics per interaction.md across every phase.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      block = false,
      arrow = false,
      loading = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={cn(
          "group inline-flex h-14 items-center justify-center rounded-lg px-8",
          "text-body font-semibold transition-all duration-fast ease-standard",
          "hover:-translate-y-0.5 hover:scale-[1.015] active:scale-[0.975] active:duration-75",
          "disabled:pointer-events-none disabled:hover:translate-y-0 disabled:hover:scale-100",
          block && "w-full",
          VARIANT_CLASSES[variant],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner />
        ) : (
          <>
            <span>{children}</span>
            {arrow && <ArrowIcon />}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
