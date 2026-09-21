"use client";

import { Check, Flag } from "lucide-react";
import { QuestionRenderer } from "./QuestionRenderer";
import { ListeningFlowchartGroup, isListeningFlowchartGroup } from "./ListeningFlowchartGroup";
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
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
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
}: Props) {
  const chooseTwo = isClientChooseTwoGroup(group);
  const flowchart = isListeningFlowchartGroup(group);
  const range = group.questions.map((question) => question.sequenceNumber);

  return (
    <section
      className="rounded-2xl border border-border bg-bg-card p-5"
      aria-label={group.groupId ? `Question group ${group.groupId}` : undefined}
    >
      {group.instructions && (
        <p className="mb-5 whitespace-pre-line text-sm font-medium leading-relaxed text-text-primary">
          {group.instructions}
        </p>
      )}

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
        <div className="space-y-6">
          {group.questions.map((question) => {
            const isCurrent = question.id === currentQuestionId;
            const isFlagged = Boolean(flags[question.id]);
            return (
              <article
                key={question.id}
                id={`listening-question-${question.sequenceNumber}`}
                className={[
                  "rounded-xl border p-4 transition-colors",
                  isCurrent ? "border-primary bg-primary/[0.03]" : "border-border/60 bg-white",
                ].join(" ")}
                aria-current={isCurrent ? "true" : undefined}
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
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
  const last = group.questions[group.questions.length - 1];

  return (
    <div id={`listening-question-${first.sequenceNumber}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Questions {first.sequenceNumber}–{last.sequenceNumber}
          </p>
          <p className="mt-1 text-sm text-text-secondary">Choose exactly two answers. {selected.length}/2 selected.</p>
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
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all",
                isSelected
                  ? "border-primary bg-primary text-white"
                  : selectionLimitReached
                    ? "cursor-not-allowed border-border bg-bg-muted text-text-tertiary opacity-60"
                    : "border-border bg-bg-card text-text-primary hover:border-primary/40 hover:bg-primary/5",
              ].join(" ")}
            >
              <span className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                isSelected ? "bg-white/20 text-white" : "bg-border/60 text-text-secondary",
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
