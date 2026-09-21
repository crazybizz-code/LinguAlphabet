"use client";

import { ArrowDown, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientListeningQuestionGroup } from "./listening-state";

interface Props {
  group: ClientListeningQuestionGroup;
  currentQuestionId: string;
  answers: Record<string, string | null>;
  flags: Record<string, boolean>;
  onSelect: (questionId: string, answer: string) => void;
  onNavigate: (questionId: string) => void;
  onToggleFlag: (questionId: string) => void;
}

export function isListeningFlowchartGroup(group: ClientListeningQuestionGroup): boolean {
  return group.questions.length > 0
    && group.questions.every((question) => (
      question.skill === "listening"
      && question.type === "form_note_table_flowchart_summary_completion"
    ))
    && (group.questions[0].optionPool?.length ?? 0) > 0;
}

function orderedFlowchartQuestions(group: ClientListeningQuestionGroup) {
  return [...group.questions].sort((left, right) => (
    (left.mockSequence ?? left.sequenceNumber) - (right.mockSequence ?? right.sequenceNumber)
    || left.sequenceNumber - right.sequenceNumber
    || left.id.localeCompare(right.id)
  ));
}

export function ListeningFlowchartGroup({
  group,
  currentQuestionId,
  answers,
  flags,
  onSelect,
  onNavigate,
  onToggleFlag,
}: Props) {
  const questions = orderedFlowchartQuestions(group);
  const optionPool = questions[0]?.optionPool ?? [];

  return (
    <div className="grid grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)] items-start gap-6 max-lg:grid-cols-1">
      <aside
        data-testid="listening-flowchart-option-bank"
        aria-label="Shared answer options"
        className="rounded-2xl border border-border bg-bg-muted p-4"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Answer options
        </p>
        <ul className="space-y-2">
          {optionPool.map((option) => (
            <li key={option.id} className="grid grid-cols-[2rem_1fr] gap-2 text-sm leading-relaxed text-text-primary">
              <span className="font-bold text-primary">{option.id}</span>
              <span>{option.text}</span>
            </li>
          ))}
        </ul>
      </aside>

      <ol aria-label="Flowchart stages" className="min-w-0">
        {questions.map((question, index) => {
          const isCurrent = question.id === currentQuestionId;
          const isFlagged = Boolean(flags[question.id]);

          return (
            <li key={question.id} className="relative">
              <article
                id={`listening-question-${question.sequenceNumber}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "rounded-2xl border bg-white p-4 transition-colors",
                  isCurrent ? "border-primary bg-primary/[0.03]" : "border-border/60",
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Question {question.sequenceNumber}
                  </p>
                  <button
                    type="button"
                    aria-label={`${isFlagged ? "Unflag" : "Flag"} question ${question.sequenceNumber}`}
                    onClick={() => {
                      onNavigate(question.id);
                      onToggleFlag(question.id);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                      isFlagged
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-text-secondary hover:bg-bg-muted",
                    )}
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden="true" fill={isFlagged ? "currentColor" : "none"} />
                    {question.sequenceNumber}
                  </button>
                </div>

                {question.questionInstruction && (
                  <p className="mb-2 text-xs text-text-secondary">{question.questionInstruction}</p>
                )}
                <p className="text-sm font-medium leading-relaxed text-text-primary">{question.question}</p>

                <label className="mt-4 flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Answer</span>
                  <select
                    aria-label={`Answer for question ${question.sequenceNumber}`}
                    value={answers[question.id] ?? ""}
                    onChange={(event) => {
                      onNavigate(question.id);
                      onSelect(question.id, event.target.value);
                    }}
                    className="min-h-11 min-w-24 rounded-xl border border-border bg-bg-card px-3 py-2 text-sm font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="" disabled>Select letter</option>
                    {optionPool.map((option) => (
                      <option key={option.id} value={option.id}>{option.id}</option>
                    ))}
                  </select>
                </label>
              </article>

              {index < questions.length - 1 && (
                <div aria-hidden="true" className="flex h-10 items-center justify-center text-primary/60">
                  <div className="h-full w-px bg-primary/20" />
                  <ArrowDown className="-ml-2.5 h-5 w-5 rounded-full bg-bg-card" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
