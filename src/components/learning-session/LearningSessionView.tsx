"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
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
import { completeMission, saveReflection, type CompleteMissionResult } from "@/lib/learning-session/complete-mission";
import { getSessionFlow, type LearningSessionContent, type SessionStep } from "@/lib/learning-session/types";

export function LearningSessionView({
  content,
  displayName,
}: {
  content: LearningSessionContent;
  displayName: string;
}) {
  const router = useRouter();
  const flow = getSessionFlow(content.contentType);
  const [step, setStep] = useState<SessionStep>(flow[0]);
  const [quizScore, setQuizScore] = useState(0);
  const [completionResult, setCompletionResult] = useState<CompleteMissionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFlashcardsFinished() {
    setStep(content.quiz.length > 0 ? "quiz" : "reflection");
  }

  function handleQuizFinished(score: number) {
    setQuizScore(score);
    setStep("reflection");
  }

  function handleReflectionFinished(reflectionText: string) {
    startTransition(async () => {
      await saveReflection({ contentId: content.contentId, contentTitle: content.title, content: reflectionText });
      const result = await completeMission({
        contentId: content.contentId,
        estimatedMinutes: content.estimatedMinutes,
        correctAnswers: quizScore,
        quizTotal: content.quiz.length,
      });
      setCompletionResult(result);
      setStep("complete");
    });
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-bg-muted to-bg">
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
        {step === "player" && <PlayerStep key="player" content={content} onNext={() => setStep("summary")} />}
        {step === "reading" && <ReadingStep key="reading" content={content} onNext={() => setStep("dictionary")} />}
        {step === "dictionary" && (
          <DictionaryStep key="dictionary" content={content} onNext={() => setStep("summary")} />
        )}
        {step === "summary" && (
          <SummaryStep key="summary" content={content} displayName={displayName} onNext={() => setStep("vocabulary")} />
        )}
        {step === "vocabulary" && (
          <VocabularyStep key="vocabulary" content={content} onNext={() => setStep("flashcards")} />
        )}
        {step === "flashcards" && (
          <FlashcardsStep key="flashcards" content={content} onNext={handleFlashcardsFinished} />
        )}
        {step === "quiz" && <QuizStep key="quiz" content={content} onNext={handleQuizFinished} />}
        {step === "reflection" && (
          <ReflectionStep key="reflection" content={content} onNext={handleReflectionFinished} />
        )}
        {step === "complete" && completionResult && (
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
          <Tuto pose="typing-laptop" size="sm" animation="floatSm" />
          <p className="text-sm font-medium text-text-tertiary">Tuto is saving your progress&hellip;</p>
        </div>
      )}
    </div>
  );
}
