"use client";

import type { ClientQuestion } from "./types";
import { familyOf, isKnownMockQuestionType } from "@/lib/mock/content/types";

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

/**
 * The fixed choice sets for the true_false_style family. These are the
 * literals the content contract itself declares as valid correctAnswer values
 * for these two types (see validator.ts's true_false_style rules) -- they are
 * NOT stored per-question in `options`, which is exactly why these questions
 * previously rendered as an empty option list.
 */
const TRUE_FALSE_CHOICES = ["True", "False", "Not Given"];
const YES_NO_CHOICES = ["Yes", "No", "Not Given"];

function wordLimitLabel(maxWords: 1 | 2 | 3, allowNumber: boolean): string {
  const words = maxWords === 1 ? "ONE WORD" : maxWords === 2 ? "TWO WORDS" : "THREE WORDS";
  return `Write NO MORE THAN ${words}${allowNumber ? " AND/OR A NUMBER" : ""} for this answer.`;
}

interface Props {
  question: ClientQuestion;
  selectedAnswer: string | null;
  onSelect: (questionId: string, answer: string) => void;
}

/** One choice button. Shared by every choice-based family so MCQ,
 * true/false and matching all look and behave identically -- the only thing
 * that differs between them is what the choices ARE and what value is
 * submitted. */
function ChoiceList({
  choices,
  selectedAnswer,
  onPick,
}: {
  choices: Array<{ value: string; label: string; text: string }>;
  selectedAnswer: string | null;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {choices.map((choice) => {
        const isSelected = selectedAnswer === choice.value;
        return (
          <button
            key={choice.value}
            onClick={() => onPick(choice.value)}
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
              {choice.label}
            </span>
            <span className="flex-1">{choice.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuestionStem({ text }: { text: string }) {
  return <p className="mb-4 text-base font-medium leading-relaxed text-text-primary">{text}</p>;
}

/**
 * Renders any Mock question by its contract FAMILY, not by its individual
 * type name -- familyOf() (src/lib/mock/content/types.ts) collapses the 13
 * IELTS types into 4 render paths, so adding a new authored type needs no
 * change here. Legacy 'mc'/'tf'/'fill' questions (Placement/Practice's
 * generic values, still valid in the DB CHECK) are not contract types and
 * keep their original behaviour exactly.
 */
export function QuestionRenderer({ question, selectedAnswer, onSelect }: Props) {
  const family = isKnownMockQuestionType(question.type) ? familyOf(question.type) : null;

  // ── word-bank completion: pick a LETTER from a supplied pool ──
  //
  // Real IELTS Summary Completion has two mechanically different forms, and
  // the audited reference paper uses both. "Complete the summary using the
  // list of words, A-K" is not a text box: the learner selects a letter, and
  // that letter is the stored answer. The pool is the discriminator (see
  // isWordBankGroup in content/validator.ts) -- a completion question that
  // carries an optionPool is the word-bank form. Without this branch such a
  // question would silently render as free text and the pool would be
  // invisible, which is exactly the gap the audit flagged.
  if (family === "completion" && (question.optionPool?.length ?? 0) > 0) {
    const pool = question.optionPool ?? [];
    return (
      <div>
        <QuestionStem text={question.question} />
        <ChoiceList
          choices={pool.map((item) => ({ value: item.id, label: item.id, text: item.text }))}
          selectedAnswer={selectedAnswer}
          onPick={(value) => onSelect(question.id, value)}
        />
      </div>
    );
  }

  // ── completion: free-text answer with the real IELTS word-limit guidance ──
  if (family === "completion" || question.type === "fill") {
    const limit = question.wordLimit;
    const typed = selectedAnswer ?? "";
    // countWords()'s own rule: whitespace-delimited tokens (normalization.ts).
    const wordCount = typed.trim() === "" ? 0 : typed.trim().split(/\s+/).length;
    const overLimit = limit != null && wordCount > limit.maxWords;

    return (
      <div>
        <QuestionStem text={question.question} />
        {limit && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {wordLimitLabel(limit.maxWords, limit.allowNumber)}
          </p>
        )}
        <input
          type="text"
          value={typed}
          onChange={(e) => onSelect(question.id, e.target.value)}
          placeholder="Type your answer…"
          aria-invalid={overLimit || undefined}
          className={[
            "w-full rounded-xl border bg-bg-card px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2",
            overLimit
              ? "border-danger focus:border-danger focus:ring-danger/20"
              : "border-border focus:border-primary focus:ring-primary/20",
          ].join(" ")}
        />
        {overLimit && (
          <p className="mt-2 text-xs font-medium text-danger">
            {wordCount} words — over the {limit.maxWords}-word limit. This answer will be marked wrong.
          </p>
        )}
      </div>
    );
  }

  // ── matching / labelling: pick from the group's shared pool, submit its id ──
  if (family === "matching_style") {
    const pool = question.optionPool ?? [];
    return (
      <div>
        <QuestionStem text={question.question} />
        {pool.length === 0 ? (
          <p className="text-sm text-text-tertiary">No options available for this question.</p>
        ) : (
          <ChoiceList
            choices={pool.map((item) => ({ value: item.id, label: item.id, text: item.text }))}
            selectedAnswer={selectedAnswer}
            onPick={(value) => onSelect(question.id, value)}
          />
        )}
      </div>
    );
  }

  // ── true/false/not given and yes/no/not given: fixed literal choices ──
  if (family === "true_false_style") {
    const choices = question.type === "yes_no_not_given" ? YES_NO_CHOICES : TRUE_FALSE_CHOICES;
    return (
      <div>
        <QuestionStem text={question.question} />
        <ChoiceList
          choices={choices.map((text, i) => ({ value: text, label: OPTION_LABELS[i], text }))}
          selectedAnswer={selectedAnswer}
          onPick={(value) => onSelect(question.id, value)}
        />
      </div>
    );
  }

  // ── multiple_choice, plus legacy 'mc'/'tf': the original options renderer ──
  const options = question.options ?? [];
  return (
    <div>
      <QuestionStem text={question.question} />
      <ChoiceList
        choices={options.map((opt, i) => ({ value: opt, label: OPTION_LABELS[i] ?? `${i + 1}`, text: opt }))}
        selectedAnswer={selectedAnswer}
        onPick={(value) => onSelect(question.id, value)}
      />
    </div>
  );
}
