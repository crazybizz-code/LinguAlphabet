"use client";

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
}

export function QuestionPalette({ questions, currentIndex, answers, flags, onNavigate, onPrev, onNext }: Props) {
  const showSectionBoundaries = questions.some((question) => Boolean(question.sectionId));
  const sectionNumbers = new Map<string, number>();

  return (
    <div className="flex w-full items-center gap-3 px-6">
      <button
        onClick={onPrev}
        disabled={currentIndex === 0}
        aria-label="Previous question"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-all hover:bg-bg-muted disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
          Questions
        </span>
        <div className="flex gap-1.5">
          {questions.map((q, i) => {
            if (q.sectionId && !sectionNumbers.has(q.sectionId)) {
              sectionNumbers.set(q.sectionId, sectionNumbers.size + 1);
            }
            const startsSection = showSectionBoundaries && q.sectionId && questions[i - 1]?.sectionId !== q.sectionId;
            const isAnswered = Boolean(answers[q.id]);
            const isCurrent = i === currentIndex;
            const isFlagged = Boolean(flags?.[q.id]);
            return (
              <div key={q.id} className={startsSection && i > 0 ? "ml-2 border-l border-border pl-3" : undefined}>
                {startsSection && (
                  <span className="mb-1 block text-center text-[9px] font-semibold uppercase text-text-tertiary">
                    S{sectionNumbers.get(q.sectionId!)}
                  </span>
                )}
                <button
                  onClick={() => onNavigate(i)}
                  aria-label={`Question ${q.sequenceNumber}${isAnswered ? " (answered)" : ""}${isFlagged ? " (flagged)" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className={[
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all",
                    isCurrent
                      ? "ring-2 ring-primary ring-offset-1 " + (isAnswered ? "bg-[#0F172A] text-white" : "bg-bg-card text-primary border border-primary")
                      : isAnswered
                      ? "bg-[#0F172A] text-white"
                      : "border border-border bg-bg-card text-text-secondary hover:border-primary/40",
                  ].join(" ")}
                >
                  {q.sequenceNumber}
                  {isFlagged && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-2 ring-bg-card"
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
        onClick={onNext}
        disabled={currentIndex === questions.length - 1}
        aria-label="Next question"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-all hover:bg-bg-muted disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
