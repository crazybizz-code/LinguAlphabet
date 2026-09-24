"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";

interface PaletteQuestion {
  id: string;
  sequenceNumber: number;
  sectionId?: string | null;
}

interface Props {
  questions: PaletteQuestion[];
  currentIndex: number;
  answers: Record<string, string | null>;
  flags?: Record<string, boolean>;
  onNavigate: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  groupLabelPrefix?: "S" | "P";
}

export function QuestionPalette({
  questions,
  currentIndex,
  answers,
  flags,
  onNavigate,
  onPrev,
  onNext,
  groupLabelPrefix = "S",
}: Props) {
  const showSectionBoundaries = questions.some((question) => Boolean(question.sectionId));
  const questionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sectionNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    for (const question of questions) {
      if (question.sectionId && !numbers.has(question.sectionId)) numbers.set(question.sectionId, numbers.size + 1);
    }
    return numbers;
  }, [questions]);

  useEffect(() => {
    questionRefs.current[currentIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex]);

  return (
    <nav aria-label="Question navigator" className="mx-auto flex w-full max-w-[1440px] items-center gap-2 px-5 max-md:px-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        aria-label="Previous question"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-white text-text-secondary transition-colors hover:border-primary/30 hover:text-text-primary disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-end gap-2 py-1">
          {questions.map((q, i) => {
            const startsSection = showSectionBoundaries && q.sectionId && questions[i - 1]?.sectionId !== q.sectionId;
            const isAnswered = Boolean(answers[q.id]);
            const isCurrent = i === currentIndex;
            const isFlagged = Boolean(flags?.[q.id]);
            return (
              <div key={q.id} className={startsSection && i > 0 ? "ml-1 border-l border-border/70 pl-3" : undefined}>
                {startsSection && (
                  <span className="mb-1 block pl-0.5 text-left text-[9px] font-bold tracking-[0.12em] text-text-tertiary">
                    {groupLabelPrefix}{sectionNumbers.get(q.sectionId!)}
                  </span>
                )}
                <button
                  ref={(element) => { questionRefs.current[i] = element; }}
                  type="button"
                  onClick={() => onNavigate(i)}
                  aria-label={`Question ${q.sequenceNumber}${isAnswered ? " (answered)" : ""}${isFlagged ? " (flagged)" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className={[
                    "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                    isCurrent
                      ? isAnswered
                        ? "bg-slate-800 text-white shadow-sm ring-2 ring-primary ring-offset-2"
                        : "border border-primary bg-bg-card text-primary shadow-sm ring-2 ring-primary ring-offset-2"
                      : isAnswered
                      ? "bg-slate-800 text-white"
                      : "border border-border bg-white text-text-secondary hover:border-primary/40 hover:text-text-primary",
                  ].join(" ")}
                >
                  {q.sequenceNumber}
                  {isFlagged && (
                    <span
                      className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 ring-2 ring-white"
                      aria-hidden="true"
                    >
                      <Flag className="h-2 w-2 fill-white text-white" aria-hidden="true" />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={currentIndex === questions.length - 1}
        aria-label="Next question"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-white text-text-secondary transition-colors hover:border-primary/30 hover:text-text-primary disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
