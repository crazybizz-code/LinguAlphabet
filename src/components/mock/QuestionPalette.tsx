"use client";

interface PaletteQuestion {
  id: string;
  sequenceNumber: number;
}

interface Props {
  questions: PaletteQuestion[];
  currentIndex: number;
  answers: Record<string, string | null>;
  flags?: Record<string, boolean>;
  onNavigate: (index: number) => void;
}

export function QuestionPalette({ questions, currentIndex, answers, flags, onNavigate }: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-6 py-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        Questions
      </span>
      <div className="flex gap-1.5">
        {questions.map((q, i) => {
          const isAnswered = Boolean(answers[q.id]);
          const isCurrent = i === currentIndex;
          const isFlagged = Boolean(flags?.[q.id]);
          return (
            <button
              key={q.id}
              onClick={() => onNavigate(i)}
              aria-label={`Question ${q.sequenceNumber}${isAnswered ? " (answered)" : ""}${isFlagged ? " (flagged)" : ""}`}
              aria-current={isCurrent ? "true" : undefined}
              className={[
                "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all",
                isCurrent
                  ? "ring-2 ring-primary ring-offset-1 " + (isAnswered ? "bg-primary text-white" : "bg-bg-card text-primary border border-primary")
                  : isAnswered
                  ? "bg-primary text-white"
                  : "border border-border bg-bg-card text-text-secondary hover:border-primary/40",
              ].join(" ")}
            >
              {q.sequenceNumber}
              {isFlagged && (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-bg-card"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
