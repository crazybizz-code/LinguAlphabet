"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatRowProps {
  icon: ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Overrides the trailing chevron (e.g. a checkmark once an action completes). Pass `null` to render nothing. */
  trailing?: ReactNode | null;
  /** Announce value changes to screen readers (e.g. "Reset link sent to..."). */
  liveValue?: boolean;
  className?: string;
}

/**
 * Shared icon-chip + label + value row — Profile's Learning Profile fields
 * and Settings' Account fields hand-rolled this identically. Renders as a
 * button (with a trailing chevron by default) when `onClick` is given, or
 * a plain non-interactive row otherwise (e.g. Settings' read-only Email row).
 */
export function StatRow({ icon, label, value, onClick, disabled = false, trailing, liveValue = false, className }: StatRowProps) {
  const content = (
    <>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        {/* text-secondary (4.76:1), not tertiary (2.56:1) — the label is
            what tells you which value you're looking at. Same fix as the
            dashboard pass; shared with Settings. */}
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        <p className="truncate text-sm font-bold text-text-primary" aria-live={liveValue ? "polite" : undefined}>
          {value}
        </p>
      </div>
      {trailing !== undefined ? trailing : onClick && <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden="true" />}
    </>
  );

  const baseClassName = cn("flex w-full items-center gap-4 rounded-2xl border border-border bg-bg-card p-4 text-left", className);

  if (!onClick) {
    return <div className={baseClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(baseClassName, "transition-colors enabled:hover:bg-bg-muted disabled:cursor-default")}
    >
      {content}
    </button>
  );
}
