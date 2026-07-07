"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Hides the <label> visually on mobile but keeps it for screen readers — set false to omit the label entirely instead. */
  hideLabelOnMobile?: boolean;
  icon?: ReactNode;
  /** Rendered after the field (e.g. a password show/hide toggle). */
  trailing?: ReactNode;
  error?: string;
}

/**
 * Labeled text input with a leading icon and focus glow — 56px height,
 * 20px squircle radius per every phase's prompt.md. Error state renders
 * a red border/ring plus the message below the field.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hideLabelOnMobile = false,
      icon,
      trailing,
      error,
      id,
      className,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "text-small font-semibold text-text-primary",
              hideLabelOnMobile && "max-md:hidden",
            )}
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex h-14 items-center gap-2 rounded-lg border-[1.5px] bg-bg-card px-[18px]",
            "transition-[border-color,box-shadow] duration-fast ease-standard",
            error
              ? "border-danger shadow-[0_0_0_4px_rgba(255,59,48,0.20)]"
              : "border-border focus-within:border-primary focus-within:shadow-[0_0_0_4px_rgba(255,107,74,0.20)]",
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
              "h-full flex-1 bg-transparent text-body text-text-primary outline-none",
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
