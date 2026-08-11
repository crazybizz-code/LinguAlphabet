"use client";

interface PaletteQuestion {
  id: string;
  sequenceNumber: number;
}

interface Props {
  questions: PaletteQuestion[];
  currentIndex: number;
  answers: Record<string, string | null>;
  onNavigate: (index: number) => void;
}

export function QuestionPalette({ questions, currentIndex, answers, onNavigate }: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-6 py-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        Questions
      </span>
      <div className="flex gap-1.5">
        {questions.map((q, i) => {
          const isAnswered = Boolean(answers[q.id]);
          const isCurrent = i === currentIndex;
          return (
            <button
              key={q.id}
              onClick={() => onNavigate(i)}
              aria-label={`Question ${q.sequenceNumber}${isAnswered ? " (answered)" : ""}`}
              aria-current={isCurrent ? "true" : undefined}
              className={[
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all",
                isCurrent
                  ? "ring-2 ring-primary ring-offset-1 " + (isAnswered ? "bg-primary text-white" : "bg-bg-card text-primary border border-primary")
                  : isAnswered
                  ? "bg-primary text-white"
                  : "border border-border bg-bg-card text-text-secondary hover:border-primary/40",
              ].join(" ")}
            >
              {q.sequenceNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
