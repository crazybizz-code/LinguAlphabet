"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Hides the <label> visually on mobile but keeps it for screen readers — set false to omit the label entirely instead. */
  hideLabelOnMobile?: boolean;
  /** Rendered at the end of the label row (e.g. a "Forgot password?" link). */
  labelExtra?: ReactNode;
  icon?: ReactNode;
  /** Rendered after the field (e.g. a password show/hide toggle). */
  trailing?: ReactNode;
  error?: string;
  /** Field height: 56px (default, e.g. the /name onboarding step) or 48px (auth screens). */
  fieldSize?: "default" | "compact";
}

const FIELD_HEIGHT: Record<NonNullable<InputProps["fieldSize"]>, string> = {
  default: "h-14",
  compact: "h-12",
};

/**
 * Labeled text input with a leading icon and focus glow — 56px height by
 * default, 48px via `fieldSize="compact"` (auth screens). Error state
 * renders a red border/ring plus the message below the field.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hideLabelOnMobile = false,
      labelExtra,
      icon,
      trailing,
      error,
      id,
      className,
      fieldSize = "default",
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const labelEl = label && (
      <label
        htmlFor={inputId}
        className={cn(
          "text-small font-semibold text-text-primary",
          hideLabelOnMobile && "max-md:hidden",
        )}
      >
        {label}
      </label>
    );

    return (
      <div className="flex flex-col gap-1.5">
        {label &&
          (labelExtra ? (
            <div className="flex items-center justify-between">
              {labelEl}
              {labelExtra}
            </div>
          ) : (
            labelEl
          ))}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border-[1.5px] bg-bg-muted px-[18px]",
            FIELD_HEIGHT[fieldSize],
            "transition-[border-color,box-shadow] duration-fast ease-standard",
            error
              ? "border-danger shadow-[0_0_0_4px_rgba(255,59,48,0.20)]"
              : "border-border focus-within:border-primary-focus focus-within:shadow-[0_0_0_4px_rgba(255,138,51,0.20)]",
          )}
        >
          {icon && (
            <span className="flex shrink-0 items-center text-text-secondary" aria-hidden="true">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              // text-text-primary (color) before text-body (font-size):
              // tailwind-merge's stock config doesn't know this project's
              // custom --text-* font-size scale (design-system.md's Body =
              // 16-17px), so it treats text-body as conflicting with any
              // text-{color} utility and silently drops whichever one comes
              // first. Every input was rendering at the body element's 14px
              // base-reset font-size instead of 16px — below Safari's
              // auto-zoom-on-focus threshold (docs/ux-launch-audit.md P0).
              // text-body still comes before `className` so a caller that
              // needs a different size (e.g. /name's `text-lg`) still wins.
              "h-full flex-1 bg-transparent text-text-primary text-body outline-none",
              "placeholder:text-text-tertiary",
              className,
            )}
            {...rest}
          />
          {trailing}
        </div>
        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
