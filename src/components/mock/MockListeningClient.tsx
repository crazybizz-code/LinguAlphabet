"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Flag, Headphones, Monitor, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ListeningAudioPlayer } from "@/components/assessment/ListeningAudioPlayer";
import { ListeningInstructions } from "@/components/assessment/ListeningInstructions";
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

export function MockListeningClient({ attemptId, questions, savedAnswers, timeLimitSeconds }: Props) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>(savedAnswers);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Track which questions' audio has already been played (one-play-only per question)
  const [playedAudioIds, setPlayedAudioIds] = useState<Set<string>>(new Set());
  // Mark-for-review flags — session-only (sessionStorage), no schema change; mirrors the
  // existing timer-anchor persistence pattern below.
  const [flagged, setFlagged] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = sessionStorage.getItem(`mock_listening_flags_${attemptId}`);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const startTimeRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);

  // Timer
  useEffect(() => {
    const key = `mock_listening_start_${attemptId}`;
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
        handleSubmit();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, timeLimitSeconds]);

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
          section: "listening",
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

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    sessionStorage.removeItem(`mock_listening_start_${attemptId}`);
    sessionStorage.removeItem(`mock_listening_flags_${attemptId}`);
    try {
      const res = await fetch("/api/mock/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to submit");
      }
      router.push(`/mock/${attemptId}/result`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed — please try again.");
      setSubmitting(false);
    }
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = { ...prev, [questionId]: !prev[questionId] };
      sessionStorage.setItem(`mock_listening_flags_${attemptId}`, JSON.stringify(next));
      return next;
    });
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const isLowTime = timeLeft <= 300;
  const hasAudio = Boolean(currentQuestion?.audioUrl);

  return (
    <>
      {/* Mobile warning */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg p-8 lg:hidden">
        <Monitor className="h-14 w-14 text-text-tertiary" aria-hidden="true" />
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary">Desktop Required</h2>
          <p className="mt-2 max-w-xs text-sm text-text-secondary">
            The mock exam requires a screen at least 1024 px wide. Please open it on a laptop or desktop.
          </p>
        </div>
        <Link href="/mock" className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white">
          Back to Mock
        </Link>
      </div>

      {/* Desktop exam shell */}
      <div className="fixed inset-0 z-50 hidden flex-col bg-bg lg:flex">
        {/* Header — 60 px */}
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border bg-[#1E293B] px-6">
          <div className="flex items-center gap-3">
            <Headphones className="h-4.5 w-4.5 text-blue-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-white">Listening Section</span>
            <span className="text-xs text-white/50">
              {answeredCount}/{questions.length} answered
            </span>
          </div>

          <span
            className={[
              "font-mono text-lg font-bold tabular-nums",
              isLowTime ? "text-red-400" : "text-white",
            ].join(" ")}
            aria-live="polite"
          >
            {formatTime(timeLeft)}
          </span>

          <div className="flex items-center gap-2">
            {submitError && (
              <span className="text-xs text-red-400">{submitError}</span>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit Mock"}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Content */}
        {currentQuestion && (
          <div className="flex min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-8 py-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Question {currentQuestion.sequenceNumber} of {questions.length}
                </p>
                <button
                  onClick={() => toggleFlag(currentQuestion.id)}
                  className={[
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                    flagged[currentQuestion.id]
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-text-secondary hover:bg-bg-muted",
                  ].join(" ")}
                >
                  <Flag
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                    fill={flagged[currentQuestion.id] ? "currentColor" : "none"}
                  />
                  {flagged[currentQuestion.id] ? "Flagged" : "Flag"}
                </button>
              </div>

              {/* Listening instructions + audio player — real audio, no fake timer */}
              {hasAudio && (
                <div className="mb-6 space-y-4">
                  <ListeningInstructions
                    sectionInstruction={currentQuestion.sectionInstruction}
                    audioInstruction={currentQuestion.audioInstruction}
                  />
                  <ListeningAudioPlayer
                    key={currentQuestion.id}
                    audioUrl={currentQuestion.audioUrl!}
                    instruction={currentQuestion.audioInstruction}
                    initiallyPlayed={playedAudioIds.has(currentQuestion.id)}
                    onPlay={() => setPlayedAudioIds((prev) => new Set([...prev, currentQuestion.id]))}
                  />
                </div>
              )}

              {/* Question-level instruction (content-driven, null until authored) */}
              {currentQuestion.questionInstruction && (
                <p className="mb-3 text-xs text-text-secondary">{currentQuestion.questionInstruction}</p>
              )}

              <QuestionRenderer
                question={currentQuestion}
                selectedAnswer={answers[currentQuestion.id] ?? null}
                onSelect={handleSelect}
              />

              {/* Prev / Next */}
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
            flags={flagged}
            onNavigate={setCurrentIndex}
          />
        </footer>
      </div>
    </>
  );
}
