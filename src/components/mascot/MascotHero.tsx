import type { ReactNode, CSSProperties } from "react";
import { Tuto, type TutoProps } from "./Tuto";
import { FloatingBadge } from "./FloatingBadge";
import { cn } from "@/lib/utils";

export interface MascotBadgeSpec {
  content: ReactNode;
  position: CSSProperties;
}

export interface MascotHeroProps extends TutoProps {
  badges?: MascotBadgeSpec[];
  wrapperClassName?: string;
}

/**
 * Tuto staged as a hero visual with surrounding floating badges — the
 * composition used by every phase that introduces or features Tuto
 * prominently. `badges` lets a screen override the default set entirely;
 * pass `[]` to render Tuto alone.
 */
export function MascotHero({
  badges = [],
  wrapperClassName,
  ...tutoProps
}: MascotHeroProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Tuto {...tutoProps} />
      {badges.map((badge, index) => (
        <FloatingBadge key={index} position={badge.position}>
          {badge.content}
        </FloatingBadge>
      ))}
    </div>
  );
}
