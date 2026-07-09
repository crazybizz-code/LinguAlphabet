import { cn } from "@/lib/utils";

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" width={14} height={14} fill="none" aria-hidden="true">
    <path
      d="M4 10.5l3.5 3.5L16 5.5"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export interface ProgressDotsProps {
  step: number;
  /**
   * 'highlight-next': current-step badge (bracket-arc decoration) + one
   * solid "up next" dot + the rest hollow. No checkmarks.
   * 'checklist': a checkmark per completed step + a plain current-step
   * badge (no brackets) + hollow dots for the rest.
   * These two variants exist because the approved reference designs for
   * different phases actually disagree on this visual — neither was
   * invented speculatively.
   */
  variant?: "highlight-next" | "checklist";
  /** highlight-next: dots rendered after the badge. */
  totalDots?: number;
  /** checklist: the full tracked range (checks + current + upcoming). */
  totalSteps?: number;
  className?: string;
}

export function ProgressDots({
  step,
  variant = "highlight-next",
  totalDots = 7,
  totalSteps = 8,
  className,
}: ProgressDotsProps) {
  return (
    <div className={cn("flex items-center gap-2 pt-1", className)}>
      {variant === "checklist" ? (
        <ChecklistDots step={step} totalSteps={totalSteps} />
      ) : (
        <HighlightNextDots step={step} totalDots={totalDots} />
      )}
    </div>
  );
}

function HighlightNextDots({ step, totalDots }: { step: number; totalDots: number }) {
  return (
    <>
      <CurrentBadge step={step} bracketed />
      {Array.from({ length: totalDots - 1 }, (_, i) => (
        <Dot key={i} solid={i === 0} />
      ))}
    </>
  );
}

function ChecklistDots({ step, totalSteps }: { step: number; totalSteps: number }) {
  const nodes: React.ReactNode[] = [];
  for (let i = 1; i < step; i++) {
    if (i > 1) nodes.push(<Dot key={`sep-${i}`} />);
    nodes.push(<DoneBadge key={`done-${i}`} />);
  }
  if (step > 1) nodes.push(<Dot key="sep-current" />);
  nodes.push(<CurrentBadge key="current" step={step} />);
  for (let i = step + 1; i <= totalSteps; i++) {
    nodes.push(<Dot key={`future-${i}`} />);
  }
  return <>{nodes}</>;
}

function CurrentBadge({ step, bracketed = false }: { step: number; bracketed?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-text-on-primary",
        bracketed &&
          "before:absolute before:top-1/2 before:-left-[9px] before:h-5 before:w-1.5 before:-translate-y-1/2 before:rounded-l-full before:border-[1.5px] before:border-r-0 before:border-primary after:absolute after:top-1/2 after:-right-[9px] after:h-5 after:w-1.5 after:-translate-y-1/2 after:rounded-r-full after:border-[1.5px] after:border-l-0 after:border-primary",
      )}
    >
      {step}
    </div>
  );
}

function DoneBadge() {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-text-on-primary">
      <CheckIcon />
    </div>
  );
}

function Dot({ solid = false }: { solid?: boolean }) {
  return (
    <div
      className={cn("h-2 w-2 rounded-full", solid ? "bg-primary" : "bg-black/12")}
    />
  );
}
