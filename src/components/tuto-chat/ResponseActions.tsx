"use client";

import { useState } from "react";
import { QuickReplyChips } from "./QuickReplyChips";
import { SmartActionCards } from "./SmartActionCards";
import { MiniQuiz } from "./MiniQuiz";
import { XPBurst } from "./XPBurst";
import { FollowUpSuggestionCard } from "./FollowUpSuggestionCard";
import { LearningPathCard } from "./LearningPathCard";
import { getQuickReplies, getFollowUpSuggestion } from "@/lib/tuto-chat/suggestions";
import { pickQuizQuestion, type MiniQuizQuestion } from "@/lib/tuto-chat/miniQuizBank";
import type { ThinkingFocus } from "./ThinkingTimeline";

export interface ResponseActionsProps {
  content: string;
  thinkingFocus: ThinkingFocus;
  onSend: (text: string) => void;
  /** Count of assistant turns so far, including this one — drives the "show once"/"alternate" heuristics below, all frontend-only. */
  turnIndex: number;
}

const FOLLOW_UP_MIN_LENGTH = 220;
const LEARNING_PATH_AT_TURN = 3;

/**
 * Sprint UX-2 (Interactive Teaching): everything below Tuto's last
 * completed response — quick replies, smart action cards, an optional
 * quick-check quiz, a follow-up suggestion, and (once, at turn 3) a
 * learning-path nudge. Entirely frontend-generated; nothing here reflects
 * a real backend signal about what would actually help this learner —
 * see each child component's own doc comment for why (this sprint
 * excludes AI architecture, prompts, and tool changes).
 */
export function ResponseActions({ content, thinkingFocus, onSend, turnIndex }: ResponseActionsProps) {
  const [quiz, setQuiz] = useState<MiniQuizQuestion | null>(null);
  const [xpTrigger, setXpTrigger] = useState(0);

  const quizFocus = thinkingFocus === "grammar" || thinkingFocus === "vocabulary" ? thinkingFocus : null;

  function handleAnswered(correct: boolean) {
    if (correct) setXpTrigger((count) => count + 1);
  }

  const quickReplies = getQuickReplies(content);
  const showFollowUp = content.length > FOLLOW_UP_MIN_LENGTH;
  const followUpQuestion = showFollowUp ? getFollowUpSuggestion(thinkingFocus, turnIndex) : null;
  const showLearningPath = turnIndex === LEARNING_PATH_AT_TURN;

  return (
    <div className="flex flex-col gap-3">
      <QuickReplyChips replies={quickReplies} onSelect={onSend} />
      <SmartActionCards
        onExample={() => onSend("Can you give me another example?")}
        onSimplify={() => onSend("Can you explain that more simply?")}
        onQuiz={() => setQuiz(pickQuizQuestion(quizFocus, quiz?.id))}
      />
      {quiz && (
        <div className="flex flex-col gap-2">
          {/* Keyed by question id — re-rolling via "Quiz me" again must start
              the new question fresh, not keep the previous one's revealed answer. */}
          <MiniQuiz key={quiz.id} quiz={quiz} onAnswered={handleAnswered} />
          <XPBurst trigger={xpTrigger} />
        </div>
      )}
      {followUpQuestion && <FollowUpSuggestionCard question={followUpQuestion} onSelect={onSend} />}
      {showLearningPath && <LearningPathCard />}
    </div>
  );
}
