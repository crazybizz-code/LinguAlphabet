"use client";

import { useState } from "react";
import { QuickReplyChips } from "./QuickReplyChips";
import { SmartActionCards } from "./SmartActionCards";
import { MiniQuiz } from "./MiniQuiz";
import { XPBurst } from "./XPBurst";
import { ConfidenceSelector } from "./ConfidenceSelector";
import { LessonSummaryCard } from "./LessonSummaryCard";
import { FollowUpSuggestionCard } from "./FollowUpSuggestionCard";
import { LearningPathCard } from "./LearningPathCard";
import { getQuickReplies, getFollowUpSuggestion } from "@/lib/tuto-chat/suggestions";
import { extractLessonTopic } from "@/lib/tuto-chat/lessonSummary";
import { pickQuizQuestion, type MiniQuizQuestion } from "@/lib/tuto-chat/miniQuizBank";
import type { ThinkingFocus } from "./ThinkingTimeline";
import type { CefrLevel } from "@/ai/context";

export interface ResponseActionsProps {
  content: string;
  thinkingFocus: ThinkingFocus;
  onSend: (text: string) => void;
  /** Count of assistant turns so far, including this one — drives the "show once"/"alternate" heuristics below, all frontend-only. */
  turnIndex: number;
  /** The same CEFR level already threaded through TutoContextInput at the call site — reused, not re-derived, per Sprint UX-3's "reuse the existing learner profile and context where available." */
  learnerLevel?: CefrLevel | null;
}

const FOLLOW_UP_MIN_LENGTH = 220;
const LEARNING_PATH_AT_TURN = 3;

/**
 * Everything below Tuto's last completed response — quick replies, smart
 * action cards, an optional quick-check quiz (with a confidence check-in
 * once answered), and at most ONE secondary card (a lesson summary, a
 * follow-up suggestion, or — once, at turn 3 — an adaptive continue-
 * learning nudge). Entirely frontend-generated; nothing here reflects a
 * real backend signal beyond what was already flowing through this
 * conversation (the CEFR level, Tuto's own reply text) — see each child
 * component's own doc comment for why (Sprint UX-2/UX-3 exclude AI
 * architecture, prompts, and tool changes).
 *
 * Sprint UX-3.1 (Polish): these three secondary cards used to all render
 * together whenever their individual conditions happened to overlap
 * (common, since a lesson topic and a long reply frequently coincide),
 * stacking up to three near-identical bordered cards under a single
 * reply. Capped at one per response now, picked by priority — the
 * turn-3 milestone nudge (rarest, most significant) first, then the
 * lesson summary (tied to real content), then the generic follow-up
 * suggestion (most frequent, so lowest priority) — rather than showing
 * every eligible card at once.
 */
export function ResponseActions({ content, thinkingFocus, onSend, turnIndex, learnerLevel = null }: ResponseActionsProps) {
  const [quiz, setQuiz] = useState<MiniQuizQuestion | null>(null);
  const [xpTrigger, setXpTrigger] = useState(0);
  const [showConfidence, setShowConfidence] = useState(false);

  const quizFocus = thinkingFocus === "grammar" || thinkingFocus === "vocabulary" ? thinkingFocus : null;

  function handleQuiz() {
    setQuiz(pickQuizQuestion(quizFocus, quiz?.id));
    setShowConfidence(false);
  }

  function handleAnswered(correct: boolean) {
    if (correct) setXpTrigger((count) => count + 1);
    setShowConfidence(true);
  }

  const quickReplies = getQuickReplies(content);
  const lessonTopic = extractLessonTopic(content);
  const showFollowUp = content.length > FOLLOW_UP_MIN_LENGTH;
  const followUpQuestion = showFollowUp ? getFollowUpSuggestion(thinkingFocus, turnIndex) : null;
  const showLearningPath = turnIndex === LEARNING_PATH_AT_TURN;

  const secondaryCard = showLearningPath ? "learningPath" : lessonTopic ? "lessonSummary" : followUpQuestion ? "followUp" : null;

  return (
    <div className="flex flex-col gap-3">
      <QuickReplyChips replies={quickReplies} onSelect={onSend} />
      <SmartActionCards
        onExample={() => onSend("Can you give me another example?")}
        onSimplify={() => onSend("Can you explain that more simply?")}
        onQuiz={handleQuiz}
      />
      {quiz && (
        <div className="flex flex-col gap-2">
          {/* Keyed by question id — re-rolling via "Quiz me" again must start
              the new question fresh, not keep the previous one's revealed answer. */}
          <MiniQuiz key={quiz.id} quiz={quiz} onAnswered={handleAnswered} />
          <XPBurst trigger={xpTrigger} />
          {showConfidence && <ConfidenceSelector />}
        </div>
      )}
      {secondaryCard === "lessonSummary" && <LessonSummaryCard topic={lessonTopic as string} />}
      {secondaryCard === "followUp" && <FollowUpSuggestionCard question={followUpQuestion as string} onSelect={onSend} />}
      {secondaryCard === "learningPath" && <LearningPathCard topic={lessonTopic} level={learnerLevel} />}
    </div>
  );
}
