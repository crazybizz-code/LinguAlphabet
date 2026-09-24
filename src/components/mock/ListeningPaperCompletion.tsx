"use client";

import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { familyOf, isKnownMockQuestionType } from "@/lib/mock/content/types";
import type { ClientQuestion } from "./types";
import type { ClientListeningQuestionGroup } from "./listening-state";

/**
 * Exam-paper presentation for a free-text completion group ("Complete the
 * form / table / notes below"). The whole group renders as one continuous
 * block with numbered inline blanks instead of one card per question. Only
 * placement changes: every blank is the same controlled input, writing the
 * same value through the same onSelect/onNavigate callbacks.
 */

export type PaperCompletionLayout = "form" | "table" | "notes" | "sentences";

/** Free-text completion only. A completion group that carries an option pool
 * (word-bank summary, flowchart letters) keeps its own renderer. */
export function isPaperCompletionGroup(group: ClientListeningQuestionGroup): boolean {
  return group.questions.length > 0
    && group.questions.every((question) => (
      isKnownMockQuestionType(question.type)
      && familyOf(question.type) === "completion"
      && (question.optionPool?.length ?? 0) === 0
    ));
}

/** The authored task instruction names the paper structure, e.g. "Complete
 * the table below." Anything unnamed falls back to a form, which degrades to
 * plain labelled rows. */
export function paperCompletionLayout(instructions: string | null): PaperCompletionLayout {
  const match = /complete\s+the\s+(form|table|notes|sentences|summary)\b/i.exec(instructions ?? "");
  const named = match?.[1].toLowerCase();
  if (named === "table" || named === "notes") return named;
  if (named === "sentences" || named === "summary") return "sentences";
  return "form";
}

const GAP_MARKER = /_{2,}|…+|\.{4,}/;

export interface CompletionStem {
  /** All text before the blank, e.g. "Stall fee: £" or "Set-up starts at". */
  before: string;
  /** Field label for a form/table row: the text up to and including the last
   * colon ("Stall fee:"), or the whole text before the blank. */
  label: string;
  /** Text between the label and the blank, e.g. a currency symbol ("£"). */
  lead: string;
  /** Text after the blank, e.g. a unit ("per day") or the end of a sentence. */
  after: string;
}

/** Splits an authored stem around its gap marker. A stem with no marker is
 * treated as a label whose blank follows it. */
export function parseCompletionStem(text: string): CompletionStem {
  const match = GAP_MARKER.exec(text);
  const before = (match ? text.slice(0, match.index) : text).trim();
  const after = match ? text.slice(match.index + match[0].length).trim() : "";
  const colon = before.lastIndexOf(":");
  const label = colon >= 0 ? before.slice(0, colon + 1).trim() : before;
  const lead = colon >= 0 ? before.slice(colon + 1).trim() : "";
  return { before, label, lead, after };
}

function wordCount(value: string): number {
  return value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
}

interface Props {
  group: ClientListeningQuestionGroup;
  layout: PaperCompletionLayout;
  currentQuestionId: string;
  answers: Record<string, string | null>;
  flags: Record<string, boolean>;
  onSelect: (questionId: string, answer: string) => void;
  onNavigate: (questionId: string) => void;
  onToggleFlag: (questionId: string) => void;
}

export function ListeningPaperCompletion({
  group,
  layout,
  currentQuestionId,
  answers,
  flags,
  onSelect,
  onNavigate,
  onToggleFlag,
}: Props) {
  const rowProps = (question: ClientQuestion) => ({
    question,
    layout,
    isCurrent: question.id === currentQuestionId,
    isFlagged: Boolean(flags[question.id]),
    answer: answers[question.id] ?? "",
    onSelect,
    onNavigate,
    onToggleFlag,
  });

  if (layout === "table") {
    return (
      <div
        data-testid="listening-paper-table"
        className="overflow-hidden rounded-md border border-slate-300"
      >
        {group.questions.map((question) => (
          <PaperRow key={question.id} {...rowProps(question)} />
        ))}
      </div>
    );
  }

  return (
    <div data-testid={`listening-paper-${layout}`} className="space-y-0.5">
      {group.questions.map((question) => (
        <PaperRow key={question.id} {...rowProps(question)} />
      ))}
    </div>
  );
}

function PaperRow({
  question,
  layout,
  isCurrent,
  isFlagged,
  answer,
  onSelect,
  onNavigate,
  onToggleFlag,
}: {
  question: ClientQuestion;
  layout: PaperCompletionLayout;
  isCurrent: boolean;
  isFlagged: boolean;
  answer: string;
  onSelect: (questionId: string, answer: string) => void;
  onNavigate: (questionId: string) => void;
  onToggleFlag: (questionId: string) => void;
}) {
  const number = question.sequenceNumber;
  const stem = parseCompletionStem(question.question);
  const ids = {
    number: `listening-q${number}-number`,
    before: `listening-q${number}-before`,
    lead: `listening-q${number}-lead`,
    after: `listening-q${number}-after`,
    limit: `listening-q${number}-limit`,
  };
  const limit = question.wordLimit;
  const overLimit = limit != null && wordCount(answer) > limit.maxWords;
  const inline = layout === "sentences" || layout === "notes";
  const labelledBy = [
    ids.number,
    stem.before && ids.before,
    !inline && stem.lead && ids.lead,
    stem.after && ids.after,
  ].filter(Boolean).join(" ");

  const blank = (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 align-middle",
        inline ? "max-md:flex max-md:w-full" : "max-md:min-w-0 max-md:flex-1",
      )}
    >
      <span
        id={ids.number}
        className={cn(
          "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[5px] border px-1 text-xs font-bold tabular-nums",
          isCurrent ? "border-primary bg-primary text-white" : "border-slate-700 text-text-primary",
        )}
      >
        <span className="sr-only">Question </span>{number}
      </span>
      <input
        type="text"
        value={answer}
        onChange={(event) => {
          onNavigate(question.id);
          onSelect(question.id, event.target.value);
        }}
        aria-labelledby={labelledBy}
        aria-invalid={overLimit || undefined}
        aria-describedby={overLimit ? ids.limit : undefined}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "h-9 w-52 min-w-0 rounded-md border bg-white px-2.5 text-[15px] text-text-primary transition-colors focus:outline-none focus:ring-2 max-md:flex-1",
          overLimit
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-slate-300 hover:border-slate-400 focus:border-primary focus:ring-primary/20",
        )}
      />
    </span>
  );

  const flagButton = (
    <button
      type="button"
      aria-label={`${isFlagged ? "Unflag" : "Flag"} question ${number}`}
      aria-pressed={isFlagged}
      onClick={() => {
        onNavigate(question.id);
        onToggleFlag(question.id);
      }}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        isFlagged
          ? "bg-primary/10 text-primary"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
      )}
    >
      <Flag className="h-3.5 w-3.5" aria-hidden="true" fill={isFlagged ? "currentColor" : "none"} />
    </button>
  );

  const after = stem.after && (
    <span id={ids.after} className="text-[15px] text-text-primary max-md:shrink-0">{stem.after}</span>
  );

  const limitWarning = overLimit && limit && (
    <p id={ids.limit} className="mt-1.5 text-xs font-medium text-danger">
      {wordCount(answer)} words — over the {limit.maxWords}-word limit. This answer will be marked wrong.
    </p>
  );

  const rowClass = cn(
    "relative transition-colors",
    isCurrent && "bg-primary/[0.035]",
  );
  const currentBar = isCurrent && (
    <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
  );

  // Form and table rows keep a label column beside the blank; notes and
  // sentences flow inline ("The fee includes ___ for the day.").
  if (!inline) {
    return (
      <div
        id={`listening-question-${number}`}
        aria-current={isCurrent ? "true" : undefined}
        className={cn(
          rowClass,
          "grid grid-cols-[minmax(9rem,16rem)_minmax(0,1fr)] items-center gap-x-5 max-md:grid-cols-1 max-md:gap-y-1.5",
          layout === "table"
            ? "border-b border-slate-200 last:border-b-0 max-md:py-3 max-md:pl-3.5 max-md:pr-2"
            : "rounded-md py-1.5 pl-3.5 pr-2",
        )}
      >
        {currentBar}
        <span
          id={ids.before}
          className={cn(
            "text-[15px] leading-6 text-text-primary",
            layout === "table" && "self-stretch border-r border-slate-200 bg-slate-50 px-3.5 py-3 font-medium max-md:border-r-0 max-md:bg-transparent max-md:p-0",
          )}
        >
          {stem.label}
        </span>
        <div className={cn(layout === "table" && "py-2 pr-2 max-md:p-0")}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 max-md:flex-nowrap">
            {stem.lead && (
              <span id={ids.lead} className="shrink-0 text-[15px] text-text-primary">{stem.lead}</span>
            )}
            {blank}
            {after}
            <span className="ml-auto shrink-0">{flagButton}</span>
          </div>
          {limitWarning}
        </div>
      </div>
    );
  }

  return (
    <div
      id={`listening-question-${number}`}
      aria-current={isCurrent ? "true" : undefined}
      className={cn(
        rowClass,
        "flex items-start gap-2 rounded-md py-1.5 pl-3.5 pr-2",
      )}
    >
      {currentBar}
      {layout === "notes" && <span aria-hidden="true" className="mt-[7px] text-text-secondary">•</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-9 text-text-primary">
          {stem.before && <span id={ids.before}>{stem.before} </span>}
          {blank}
          {after && <> {after}</>}
        </p>
        {limitWarning}
      </div>
      {flagButton}
    </div>
  );
}
