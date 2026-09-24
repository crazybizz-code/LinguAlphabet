"use client";

import type { ReactNode } from "react";
import { Check, Flag } from "lucide-react";
import { QuestionRenderer } from "./QuestionRenderer";
import { ListeningFlowchartGroup, isListeningFlowchartGroup } from "./ListeningFlowchartGroup";
import {
  ListeningPaperCompletion,
  isPaperCompletionGroup,
  paperCompletionLayout,
} from "./ListeningPaperCompletion";
import type { ClientListeningQuestionGroup } from "./listening-state";
import {
  chooseTwoOptionPool,
  hydrateChooseTwoSelections,
  isClientChooseTwoGroup,
  toggleChooseTwoSelection,
} from "./listening-choose-two";

interface Props {
  group: ClientListeningQuestionGroup;
  currentQuestionId: string;
  answers: Record<string, string | null>;
  flags: Record<string, boolean>;
  onSelect: (questionId: string, answer: string) => void;
  onChooseTwoChange: (group: ClientListeningQuestionGroup, selections: string[]) => void;
  onNavigate: (questionId: string) => void;
  onToggleFlag: (questionId: string) => void;
  /** "paper" renders a free-text completion group as one continuous
   * exam-paper block; any other group type keeps its card renderer. */
  variant?: "card" | "paper";
}

// Runs of authored capitals in an instruction ("NO MORE THAN TWO WORDS",
// "ONE WORD AND/OR A NUMBER"), emphasised as a printed IELTS paper does.
const EMPHASIS_RUN = /\b[A-Z]{2,}(?:\/[A-Z]{2,})?(?:\s+(?:[A-Z]{2,}(?:\/[A-Z]{2,})?|A(?=\s+[A-Z]{2,})))*/g;

function PaperInstructionLine({ line }: { line: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(EMPHASIS_RUN)) {
    if (match.index > cursor) parts.push(line.slice(cursor, match.index));
    parts.push(<strong key={match.index} className="font-bold text-text-primary">{match[0]}</strong>);
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) parts.push(line.slice(cursor));
  return <p>{parts}</p>;
}

function groupHeading(instructions: string | null, first: number, last: number) {
  const lines = (instructions ?? "").split("\n");
  const authoredRange = /^Questions?\s+\d+(?:\s*[–-]\s*\d+)?\s*:?$/i.test(lines[0]?.trim() ?? "")
    ? lines.shift()?.trim().replace(/:$/, "")
    : null;
  return {
    range: authoredRange ?? `Questions ${first}${first === last ? "" : `–${last}`}`,
    instructions: lines.join("\n").trim(),
  };
}

function FlagButton({ questionId, number, flagged, onNavigate, onToggleFlag }: {
  questionId: string;
  number: number;
  flagged: boolean;
  onNavigate: (questionId: string) => void;
  onToggleFlag: (questionId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${flagged ? "Unflag" : "Flag"} question ${number}`}
      onClick={() => {
        onNavigate(questionId);
        onToggleFlag(questionId);
      }}
      className={[
        "flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
        flagged
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-text-secondary hover:bg-bg-muted",
      ].join(" ")}
    >
      <Flag className="h-3.5 w-3.5" aria-hidden="true" fill={flagged ? "currentColor" : "none"} />
      {number}
    </button>
  );
}

export function ListeningQuestionGroup({
  group,
  currentQuestionId,
  answers,
  flags,
  onSelect,
  onChooseTwoChange,
  onNavigate,
  onToggleFlag,
  variant = "card",
}: Props) {
  const chooseTwo = isClientChooseTwoGroup(group);
  const flowchart = isListeningFlowchartGroup(group);
  const range = group.questions.map((question) => question.sequenceNumber);
  const heading = groupHeading(group.instructions, range[0], range[range.length - 1]);

  if (variant === "paper" && isPaperCompletionGroup(group)) {
    const headingId = `listening-group-${range[0]}-heading`;
    return (
      <section
        className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0"
        aria-label={group.groupId ? `Question group ${group.groupId}` : undefined}
        aria-describedby={headingId}
      >
        <header id={headingId} className="mb-4">
          <h2 className="text-[15px] font-bold text-text-primary">{heading.range}</h2>
          {heading.instructions && (
            <div className="mt-1 space-y-0.5 text-sm leading-relaxed text-text-secondary">
              {heading.instructions.split("\n").filter((line) => line.trim()).map((line, index) => (
                <PaperInstructionLine key={index} line={line} />
              ))}
            </div>
          )}
        </header>
        <ListeningPaperCompletion
          group={group}
          layout={paperCompletionLayout(group.instructions)}
          currentQuestionId={currentQuestionId}
          answers={answers}
          flags={flags}
          onSelect={onSelect}
          onNavigate={onNavigate}
          onToggleFlag={onToggleFlag}
        />
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-border/80 bg-bg-card p-5 shadow-[0_8px_24px_rgba(15,23,42,0.035)] max-md:p-4"
      aria-label={group.groupId ? `Question group ${group.groupId}` : undefined}
    >
      <header className="mb-4 border-b border-border/60 pb-3">
        <p className="text-xs font-semibold text-text-primary">{heading.range}</p>
        {heading.instructions && (
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
            {heading.instructions}
          </p>
        )}
      </header>

      {chooseTwo ? (
        <ChooseTwoGroup
          group={group}
          answers={answers}
          flags={flags}
          onChange={onChooseTwoChange}
          onNavigate={onNavigate}
          onToggleFlag={onToggleFlag}
        />
      ) : flowchart ? (
        <ListeningFlowchartGroup
          group={group}
          currentQuestionId={currentQuestionId}
          answers={answers}
          flags={flags}
          onSelect={onSelect}
          onNavigate={onNavigate}
          onToggleFlag={onToggleFlag}
        />
      ) : (
        <div className="space-y-4">
          {group.questions.map((question) => {
            const isCurrent = question.id === currentQuestionId;
            const isFlagged = Boolean(flags[question.id]);
            return (
              <article
                key={question.id}
                id={`listening-question-${question.sequenceNumber}`}
                className={[
                  "rounded-xl border p-4 transition-colors",
                  isCurrent ? "border-primary/40 bg-primary/[0.025]" : "border-border/60 bg-bg-card",
                ].join(" ")}
                aria-current={isCurrent ? "true" : undefined}
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold text-text-tertiary">
                    Question {question.sequenceNumber}
                  </p>
                  <FlagButton
                    questionId={question.id}
                    number={question.sequenceNumber}
                    flagged={isFlagged}
                    onNavigate={onNavigate}
                    onToggleFlag={onToggleFlag}
                  />
                </div>

                {question.questionInstruction && (
                  <p className="mb-3 text-xs text-text-secondary">{question.questionInstruction}</p>
                )}

                <QuestionRenderer
                  question={question}
                  selectedAnswer={answers[question.id] ?? null}
                  onSelect={(questionId, answer) => {
                    onNavigate(questionId);
                    onSelect(questionId, answer);
                  }}
                />
              </article>
            );
          })}
        </div>
      )}

      {chooseTwo && range.length === 2 && (
        <span className="sr-only">Questions {range[0]} and {range[1]} share this answer set.</span>
      )}
    </section>
  );
}

function ChooseTwoGroup({
  group,
  answers,
  flags,
  onChange,
  onNavigate,
  onToggleFlag,
}: {
  group: ClientListeningQuestionGroup;
  answers: Record<string, string | null>;
  flags: Record<string, boolean>;
  onChange: (group: ClientListeningQuestionGroup, selections: string[]) => void;
  onNavigate: (questionId: string) => void;
  onToggleFlag: (questionId: string) => void;
}) {
  const selected = hydrateChooseTwoSelections(group, answers);
  const pool = chooseTwoOptionPool(group);
  const first = group.questions[0];

  return (
    <div id={`listening-question-${first.sequenceNumber}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Choose exactly two answers.</p>
          <p className="mt-1 text-xs font-semibold text-primary">{selected.length}/2 selected</p>
        </div>
        <div className="flex gap-2" aria-label="Review flags for this question group">
          {group.questions.map((question) => (
            <FlagButton
              key={question.id}
              questionId={question.id}
              number={question.sequenceNumber}
              flagged={Boolean(flags[question.id])}
              onNavigate={onNavigate}
              onToggleFlag={onToggleFlag}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {pool.map((option) => {
          const isSelected = selected.includes(option.id);
          const selectionLimitReached = selected.length >= 2 && !isSelected;
          return (
            <button
              key={option.id}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              disabled={selectionLimitReached}
              onClick={() => onChange(group, toggleChooseTwoSelection(group, selected, option.id))}
              className={[
                "flex min-h-11 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-1",
                isSelected
                  ? "border-primary/50 bg-primary/[0.08] text-text-primary"
                  : selectionLimitReached
                    ? "cursor-not-allowed border-border bg-bg-muted text-text-tertiary opacity-60"
                    : "border-border bg-bg-card text-text-primary hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                isSelected ? "border-primary bg-primary text-white" : "border-border bg-slate-50 text-text-secondary",
              ].join(" ")}>
                {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : option.id}
              </span>
              <span className="flex-1">{option.text}</span>
            </button>
          );
        })}
      </div>
      {selected.length >= 2 && (
        <p className="mt-3 text-xs text-text-secondary">Deselect an answer before choosing a different option.</p>
      )}
    </div>
  );
}
