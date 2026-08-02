"use client";

import { useEffect, useLayoutEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { track } from "@/lib/analytics/client";
import { SessionStepper } from "./SessionStepper";
import { PlayerStep } from "./PlayerStep";
import { ReadingStep } from "./ReadingStep";
import { DictionaryStep } from "./DictionaryStep";
import { SummaryStep } from "./SummaryStep";
import { VocabularyStep } from "./VocabularyStep";
import { FlashcardsStep } from "./FlashcardsStep";
import { QuizStep } from "./QuizStep";
import { ReflectionStep } from "./ReflectionStep";
import { CompleteStep } from "./CompleteStep";
import { completeMission, type CompleteMissionResult } from "@/lib/learning-session/complete-mission";
import { computeXpEarned } from "@/lib/learning-session/xp";
import { getSessionFlow, type LearningSessionContent, type SessionStep } from "@/lib/learning-session/types";

export function LearningSessionView({
  content,
  displayName,
  isMission,
  previewMode = false,
}: {
  content: LearningSessionContent;
  displayName: string;
  /** Product Intelligence Sprint — whether this is one of today's two guided Daily Mission slots vs. a casual Explore pick, for lesson_started's slotType. */
  isMission: boolean;
  /** Operator draft-preview mode — skips analytics, XP, streaks, and all progress writes. */
  previewMode?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    // Never fire analytics events for draft preview sessions — the content
    // isn't published and the operator is not a learner.
    if (previewMode) return;
    track({
      name: "lesson_started",
      properties: {
        contentId: content.contentId,
        contentType: content.contentType as "podcast" | "article",
        slotType: isMission ? "mission" : "casual",
        cefrLevel: content.cefrLevel,
      },
    });
    // Fired once per real mount of a Learning Session — deliberately not
    // re-armed if any of these props somehow changed identity, since a
    // learner never navigates to a *different* piece of content without
    // this whole component remounting fresh anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Steps whose data is empty are removed from the flow entirely -- an
  // article ingested with no vocabulary/quiz (real rows exist like this)
  // would otherwise dead-end the session on a Flashcards deck of zero
  // cards or a "Question 1 of 0" quiz. The stepper renders the same
  // filtered flow, so the dots always match what actually happens.
  const flow = getSessionFlow(content.contentType).filter((s) => {
    if ((s === "vocabulary" || s === "flashcards") && content.vocabulary.length === 0) return false;
    if (s === "quiz" && content.quiz.length === 0) return false;
    return true;
  });
  const [step, setStep] = useState<SessionStep>(flow[0]);
  const [quizScore, setQuizScore] = useState(0);
  const [completionResult, setCompletionResult] = useState<CompleteMissionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // CRITICAL ISSUE #1/#6: Reading -> Dictionary -> Vocabulary -> Flashcards
  // -> Quiz -> Summary are all client-side state swaps on ONE url (no real
  // navigation), so the browser's own scroll position and any leftover
  // focus/keyboard from the previous step would otherwise carry straight
  // into the next one. Every step must open like a brand new page: reset
  // to scrollTop 0 and drop focus (which also dismisses the mobile
  // keyboard) the instant `step` changes, before the browser paints it.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [step]);

  /** The step after `current` in this session's (already filtered) flow. */
  function nextAfter(current: SessionStep): SessionStep {
    const index = flow.indexOf(current);
    return flow[Math.min(index + 1, flow.length - 1)];
  }

  function handleQuizFinished(score: number) {
    setQuizScore(score);
    setStep(nextAfter("quiz"));
  }

  /**
   * Commits the completion (XP/streak/progress) and advances to the
   * Complete celebration. This is the one server round-trip in the whole
   * session, and it must NEVER strand the learner on Summary: the server
   * action gets one retry, and if it still fails the session advances
   * anyway with a client-computed result (XP from the same pure formula
   * the server uses; streak/level shown conservatively) -- losing one
   * progress write is recoverable, a learner stuck on a dead button in a
   * live demo is not. The failure is logged for follow-up either way.
   *
   * In preview mode the function returns immediately after advancing the
   * step — completeMission is never called and no progress is written.
   */
  function handleFinishSession() {
    if (previewMode) {
      setStep("complete");
      return;
    }
    startTransition(async () => {
      const params = {
        contentId: content.contentId,
        contentType: content.contentType === "podcast" ? ("podcast" as const) : ("article" as const),
        estimatedMinutes: content.estimatedMinutes,
        correctAnswers: quizScore,
        quizTotal: content.quiz.length,
      };

      let result: CompleteMissionResult | null = null;
      for (let attempt = 1; attempt <= 2 && !result; attempt++) {
        try {
          result = await completeMission(params);
        } catch (error) {
          console.error(`completeMission failed (attempt ${attempt}):`, error);
        }
      }

      setCompletionResult(
        result ?? {
          xpEarned: computeXpEarned({ isMission: false, correctAnswers: quizScore }),
          newLevel: 1,
          leveledUp: false,
          newStreak: 1,
          streakContinued: false,
          isMission: false,
          // The real write already failed once (that's why we're here) — we
          // genuinely don't know the learner's real prior state, so this
          // conservatively claims nothing rather than risk a false "first
          // session!" or "streak reset" celebration.
          isFirstSession: false,
          streakStatus: "same",
          // Same conservative reasoning as isFirstSession above: the real
          // write already failed, so neither a shield-earned nor a
          // shield-used moment can be claimed with any confidence.
          shieldEarned: false,
          shieldUsed: false,
        },
      );
      setStep("complete");
    });
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-bg-muted to-bg">
      {previewMode && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-xs font-semibold text-amber-950">
          <span>DRAFT PREVIEW</span>
          <span className="opacity-60">—</span>
          <span className="font-normal opacity-80">No XP, streaks, or progress will be recorded</span>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-5 sm:px-8 sm:py-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card shadow-sm transition-all hover:shadow-md"
        >
          <ArrowLeft className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 px-2 sm:px-4">
          {step !== "complete" && <SessionStepper current={step} steps={flow.filter((s) => s !== "complete")} />}
        </div>
        <div className="w-10 shrink-0" />
      </div>

      <AnimatePresence mode="wait">
        {step === "player" && <PlayerStep key="player" content={content} onNext={() => setStep(nextAfter("player"))} previewMode={previewMode} />}
        {step === "reading" && <ReadingStep key="reading" content={content} onNext={() => setStep(nextAfter("reading"))} />}
        {step === "dictionary" && (
          <DictionaryStep key="dictionary" content={content} onNext={() => setStep(nextAfter("dictionary"))} />
        )}
        {step === "vocabulary" && (
          <VocabularyStep key="vocabulary" content={content} onNext={() => setStep(nextAfter("vocabulary"))} />
        )}
        {step === "flashcards" && (
          <FlashcardsStep key="flashcards" content={content} onNext={() => setStep(nextAfter("flashcards"))} />
        )}
        {step === "quiz" && <QuizStep key="quiz" content={content} onNext={handleQuizFinished} previewMode={previewMode} />}
        {step === "reflection" && (
          <ReflectionStep key="reflection" content={content} onNext={() => setStep(nextAfter("reflection"))} />
        )}
        {step === "summary" && (
          <SummaryStep
            key="summary"
            content={content}
            displayName={displayName}
            quizScore={quizScore}
            quizTotal={content.quiz.length}
            finishing={isPending}
            onFinish={handleFinishSession}
          />
        )}
        {step === "complete" && previewMode && (
          <div key="complete-preview" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
            <span className="rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Draft Preview Complete
            </span>
            <h2 className="text-2xl font-bold text-text">Preview finished</h2>
            <p className="max-w-sm text-sm text-text-secondary">
              No XP, streaks, or learner progress were recorded. This was a draft-only operator preview.
            </p>
          </div>
        )}
        {step === "complete" && !previewMode && completionResult && (
          <CompleteStep
            key="complete"
            displayName={displayName}
            score={quizScore}
            totalQuestions={content.quiz.length}
            result={completionResult}
          />
        )}
      </AnimatePresence>

      {isPending && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-bg/80 backdrop-blur-sm">
          <Tuto pose="thinking" size="sm" animation="floatSm" />
          <p className="text-sm font-medium text-text-tertiary">Tuto is saving your progress&hellip;</p>
        </div>
      )}
    </div>
  );
}
