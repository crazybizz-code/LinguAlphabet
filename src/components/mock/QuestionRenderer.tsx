"use client";

import type { ClientQuestion } from "./types";

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

interface Props {
  question: ClientQuestion;
  selectedAnswer: string | null;
  onSelect: (questionId: string, answer: string) => void;
}

export function QuestionRenderer({ question, selectedAnswer, onSelect }: Props) {
  if (question.type === "fill") {
    return (
      <div>
        <p className="mb-4 text-base font-medium leading-relaxed text-text-primary">
          {question.question}
        </p>
        <input
          type="text"
          value={selectedAnswer ?? ""}
          onChange={(e) => onSelect(question.id, e.target.value)}
          placeholder="Type your answer…"
          className="w-full rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
    );
  }

  const options = question.options ?? [];

  return (
    <div>
      <p className="mb-4 text-base font-medium leading-relaxed text-text-primary">
        {question.question}
      </p>
      <div className="flex flex-col gap-2">
        {options.map((opt, i) => {
          const label = OPTION_LABELS[i] ?? `${i + 1}`;
          const isSelected = selectedAnswer === opt;
          return (
            <button
              key={opt}
              onClick={() => onSelect(question.id, opt)}
              className={[
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all",
                isSelected
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-bg-card text-text-primary hover:border-primary/40 hover:bg-primary/5",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  isSelected ? "bg-white/20 text-white" : "bg-border/60 text-text-secondary",
                ].join(" ")}
              >
                {label}
              </span>
              <span className="flex-1">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
