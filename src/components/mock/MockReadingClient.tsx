"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Monitor, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { QuestionPalette } from "./QuestionPalette";
import { QuestionRenderer } from "./QuestionRenderer";
import type { ClientQuestion } from "./types";

interface Props {
  attemptId: string;
  questions: ClientQuestion[];
  savedAnswers: Record<string, string | null>;
  timeLimitSeconds: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MockReadingClient({ attemptId, questions, savedAnswers, timeLimitSeconds }: Props) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>(savedAnswers);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [finishing, setFinishing] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);

  // Timer — persists across refreshes via sessionStorage
  useEffect(() => {
    const key = `mock_reading_start_${attemptId}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      startTimeRef.current = parseInt(stored, 10);
    } else {
      startTimeRef.current = Date.now();
      sessionStorage.setItem(key, String(startTimeRef.current));
    }

    function tick() {
      const elapsed = Math.floor((Date.now() - startTimeRef.current!) / 1000);
      const remaining = Math.max(0, timeLimitSeconds - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0 && !timedOutRef.current) {
        timedOutRef.current = true;
        sessionStorage.removeItem(key);
        router.push(`/mock/${attemptId}/listening`);
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attemptId, timeLimitSeconds, router]);

  const saveAnswer = useCallback(
    (questionId: string, answer: string) => {
      const q = questions.find((q) => q.id === questionId);
      if (!q) return;
      fetch("/api/mock/answer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          questionId,
          section: "reading",
          userAnswer: answer,
          sequenceNumber: q.sequenceNumber,
        }),
      }).catch(console.error);
    },
    [attemptId, questions],
  );

  function handleSelect(questionId: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    saveAnswer(questionId, answer);
  }

  function handleFinish() {
    if (finishing) return;
    setFinishing(true);
    sessionStorage.removeItem(`mock_reading_start_${attemptId}`);
    router.push(`/mock/${attemptId}/listening`);
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const isLowTime = timeLeft <= 300; // 5 min

  return (
    <>
      {/* Mobile / tablet — block */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg p-8 lg:hidden">
        <Monitor className="h-14 w-14 text-text-tertiary" aria-hidden="true" />
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary">Desktop Required</h2>
          <p className="mt-2 max-w-xs text-sm text-text-secondary">
            The mock exam requires a screen at least 1024 px wide. Please open it on a laptop or desktop.
          </p>
        </div>
        <Link
          href="/mock"
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white"
        >
          Back to Mock
        </Link>
      </div>

      {/* Desktop — full exam shell */}
      <div className="fixed inset-0 z-50 hidden flex-col bg-bg lg:flex">
        {/* Header — 60 px */}
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border bg-[#1E293B] px-6">
          <div className="flex items-center gap-3">
            <BookOpen className="h-4.5 w-4.5 text-blue-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-white">Reading Section</span>
            <span className="text-xs text-white/50">
              {answeredCount}/{questions.length} answered
            </span>
          </div>

          {/* Timer */}
          <span
            className={[
              "font-mono text-lg font-bold tabular-nums",
              isLowTime ? "text-red-400" : "text-white",
            ].join(" ")}
            aria-live="polite"
            aria-label={`Time remaining: ${formatTime(timeLeft)}`}
          >
            {formatTime(timeLeft)}
          </span>

          <button
            onClick={handleFinish}
            disabled={finishing}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-primary-dark disabled:opacity-60"
          >
            Finish Reading
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Content — 50/50 split */}
        {currentQuestion && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left — passage */}
            <div className="w-1/2 overflow-y-auto border-r border-border/60 p-6">
              {currentQuestion.passage ? (
                <>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {currentQuestion.passageTitle ?? "Reading Passage"}
                  </p>
                  <p className="text-sm leading-[1.8] text-text-primary">
                    {currentQuestion.passage}
                  </p>
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-text-tertiary">No passage for this question.</p>
                </div>
              )}
            </div>

            {/* Right — question */}
            <div className="w-1/2 overflow-y-auto p-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Question {currentQuestion.sequenceNumber} of {questions.length}
              </p>
              <QuestionRenderer
                question={currentQuestion}
                selectedAnswer={answers[currentQuestion.id] ?? null}
                onSelect={handleSelect}
              />

              {/* Prev / Next navigation */}
              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition-all hover:border-primary/40 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Previous
                </button>
                <button
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                  disabled={currentIndex === questions.length - 1}
                  className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition-all hover:border-primary/40 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Palette footer — 70 px */}
        <footer className="flex h-[70px] shrink-0 items-center border-t border-border/60 bg-bg-card">
          <QuestionPalette
            questions={questions}
            currentIndex={currentIndex}
            answers={answers}
            onNavigate={setCurrentIndex}
          />
        </footer>
      </div>
    </>
  );
}
