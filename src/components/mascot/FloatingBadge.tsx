import type { ReactNode, CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface FloatingBadgeProps {
  children: ReactNode;
  /** Absolute position (top/left/right/bottom), e.g. `{ top: "14%", left: "10%" }`. */
  position: CSSProperties;
  className?: string;
}

/**
 * Small floating pill used around Tuto (Aa / headphone / book / mic /
 * sparkle icons across phases). z-index is required, not decorative:
 * Tuto's own image has an explicit z-index that otherwise escapes into
 * this shared stacking context and paints over the badge wherever their
 * boxes overlap.
 */
export function FloatingBadge({ children, position, className }: FloatingBadgeProps) {
  return (
    <div
      className={cn(
        "absolute z-[2] flex h-11 w-11 items-center justify-center rounded-full",
        "bg-bg-card text-badge font-bold text-primary shadow-sm",
        className,
      )}
      style={position}
    >
      {children}
    </div>
  );
}
