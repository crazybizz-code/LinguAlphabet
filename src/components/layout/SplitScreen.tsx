import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SplitScreenProps {
  hero: ReactNode;
  panel: ReactNode;
  /** 50/50 (used only by 01-authentication) instead of the default 5:7 onboarding ratio. */
  even?: boolean;
  /** Right panel is a pure white canvas instead of the warm paper background (01-authentication only). */
  canvasPanel?: boolean;
  className?: string;
}

/**
 * The universal split composition: Tuto hero panel + floating content
 * card. Desktop-first: base rules target the 1440px canvas, narrower
 * tiers override via max-width variants.
 *   Desktop 1440px+ (base): 5:7 columns (or 1:1 with `even`)
 *   Laptop  1024-1439px (max-xl:): 2:3 columns
 *   Tablet  768-1023px  (max-lg:): single column, compact top hero
 *   Mobile  <768px      (max-md:): single column, safe-area padding
 */
export function SplitScreen({ hero, panel, even = false, canvasPanel = false, className }: SplitScreenProps) {
  return (
    <div
      className={cn(
        "grid min-h-full w-full items-stretch",
        even ? "grid-cols-[1fr_1fr]" : "grid-cols-[5fr_7fr]",
        "max-xl:grid-cols-[2fr_3fr] max-lg:grid-cols-1",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex flex-col items-center justify-center bg-bg px-12 py-16",
          "max-lg:px-8 max-lg:pt-10 max-lg:pb-6",
          "max-md:px-5 max-md:pt-[calc(24px+env(safe-area-inset-top))] max-md:pb-4",
        )}
      >
        {hero}
      </div>
      <div
        className={cn(
          "flex flex-col items-center justify-center px-12 py-16",
          canvasPanel ? "bg-bg-card" : "bg-bg",
          "max-lg:px-8 max-lg:pt-6 max-lg:pb-12",
          "max-md:px-5 max-md:pt-4 max-md:pb-[calc(24px+env(safe-area-inset-bottom))]",
        )}
      >
        {panel}
      </div>
    </div>
  );
}
