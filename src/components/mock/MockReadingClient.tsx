"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Flag } from "lucide-react";
import { QuestionRenderer } from "./QuestionRenderer";
import { PassageHighlighter } from "./PassageHighlighter";
import { QuestionPalette } from "./QuestionPalette";
import { buildReadingParts, countAnsweredQuestions, findReadingPartIndex } from "./reading-state";
import type { ClientQuestion } from "./types";

interface Props {
  attemptId: string;
  questions: ClientQuestion[];
  savedAnswers: Record<string, string | null>;
  timeLimitSeconds: number;
  /** True when this attempt has no Listening section. Finishing Reading then
   * submits the whole mock instead of advancing to /listening -- for a full
   * mock this stays false and the flow is completely unchanged. */
  readingOnly?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function splitGroupInstructions(instructions: string) {
  const lines = instructions.split("\n");
  const range = /^Questions?\s+\d+(?:\s*[–-]\s*\d+)?\s*:?$/i.test(lines[0]?.trim() ?? "")
    ? lines.shift()?.trim().replace(/:$/, "") ?? null
    : null;
  return { range, detail: lines.join("\n").trim() };
}

/**
 * Groups the flat question list into Parts by structural passage, preserving
 * the assembled order. Matches the reference's Part model
 * (docs/reading-ielts-reference-audit.md §5): one Part visible at a time,
 * the others hidden rather than unmounted, so answers and passage highlights
 * survive every switch without being serialised.
 */
export function MockReadingClient({ attemptId, questions, savedAnswers, timeLimitSeconds, readingOnly = false }: Props) {
  const router = useRouter();
  const parts = useMemo(() => buildReadingParts(questions), [questions]);
  const paletteQuestions = useMemo(() => questions.map((question) => ({
    id: question.id,
    sequenceNumber: question.sequenceNumber,
    sectionId: question.passageId,
  })), [questions]);

  const [activePart, setActivePart] = useState(0);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(questions[0]?.id ?? null);
  const [answers, setAnswers] = useState<Record<string, string | null>>(savedAnswers);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [finishing, setFinishing] = useState(false);
  const [mobilePane, setMobilePane] = useState<"passage" | "questions">("passage");
  const [flagged, setFlagged] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = sessionStorage.getItem(`mock_reading_flags_${attemptId}`);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  const startTimeRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);
  const pendingSavesRef = useRef<Set<Promise<void>>>(new Set());
  // One ref per part so each passage keeps its own highlight spans; the
  // inactive panels stay mounted (hidden) so nothing is lost on switching.
  const passageRefs = useRef<Array<HTMLDivElement | null>>([]);
  // A getter, not `passageRefs.current[activePart]` inline: refs must not be
  // read during render. The highlighter resolves it in effects and handlers.
  const getActivePassage = useCallback(() => passageRefs.current[activePart] ?? null, [activePart]);

  const finishAttempt = useCallback(async () => {
    sessionStorage.removeItem(`mock_reading_start_${attemptId}`);
    // A learner can answer and immediately click Finish/Next. Wait for every
    // in-flight autosave so navigation cannot cancel the final response PUT.
    await Promise.allSettled([...pendingSavesRef.current]);
    if (!readingOnly) {
      router.push(`/mock/${attemptId}/listening`);
      return;
    }
    try {
      await fetch("/api/mock/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
    } catch (error) {
      console.error(error);
    }
    router.push(`/mock/${attemptId}/result`);
  }, [attemptId, readingOnly, router]);

  // Timer — persists across refreshes via sessionStorage
  useEffect(() => {
    const key = `mock_reading_start_${attemptId}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      startTimeRef.current = Number(stored);
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
        void finishAttempt();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attemptId, timeLimitSeconds, finishAttempt]);

  const saveAnswer = useCallback(
    (questionId: string, answer: string) => {
      const q = questions.find((q) => q.id === questionId);
      if (!q) return;
      const request = fetch("/api/mock/answer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          questionId,
          section: "reading",
          userAnswer: answer,
          sequenceNumber: q.sequenceNumber,
        }),
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Answer save failed with status ${response.status}`);
      });
      pendingSavesRef.current.add(request);
      void request.catch(console.error).finally(() => pendingSavesRef.current.delete(request));
    },
    [attemptId, questions],
  );

  function handleSelect(questionId: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    setActiveQuestionId(questionId);
    saveAnswer(questionId, answer);
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = { ...prev, [questionId]: !prev[questionId] };
      sessionStorage.setItem(`mock_reading_flags_${attemptId}`, JSON.stringify(next));
      return next;
    });
  }

  /** Moves to a question anywhere in the test, switching Part automatically —
   * the reference's goToQuestion/partOfQuestion behaviour. */
  const goToQuestion = useCallback(
    (questionId: string) => {
      const partIndex = findReadingPartIndex(parts, questionId);
      if (partIndex >= 0) setActivePart(partIndex);
      setActiveQuestionId(questionId);
      setMobilePane("questions");
      requestAnimationFrame(() => {
        document.getElementById(`q-block-${questionId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    },
    [parts],
  );

  const flatIndex = questions.findIndex((q) => q.id === activeQuestionId);
  const goPrev = () => { if (flatIndex > 0) goToQuestion(questions[flatIndex - 1].id); };
  const goNext = () => { if (flatIndex < questions.length - 1) goToQuestion(questions[flatIndex + 1].id); };

  const answeredCount = countAnsweredQuestions(questions, answers);
  const isLowTime = timeLeft <= 300;

  function handleFinish() {
    if (finishing) return;
    setFinishing(true);
    void finishAttempt();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      {/* Header */}
      <header className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/80 bg-bg-card px-6 max-md:h-14 max-md:px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F172A]">
            <BookOpen className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <span className="truncate text-sm font-semibold text-text-primary max-md:hidden">Full Mock · Reading</span>
          <span className="text-xs text-text-tertiary max-lg:hidden">{answeredCount}/{questions.length} answered</span>
        </div>

        <span
          className={["font-mono text-lg font-bold tabular-nums max-md:text-base", isLowTime ? "text-red-500" : "text-text-primary"].join(" ")}
          aria-live="polite"
          aria-label={`Time remaining: ${formatTime(timeLeft)}`}
        >
          {formatTime(timeLeft)}
        </span>

        <div className="flex min-w-0 items-center justify-end gap-3 max-md:gap-2">
          <div className="max-md:hidden">
            <PassageHighlighter getContainer={getActivePassage} containerKey={activePart} />
          </div>
          <button
            onClick={handleFinish}
            disabled={finishing}
            className="min-h-9 shrink-0 rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 max-md:px-3 max-md:text-xs"
          >
            {readingOnly ? "Finish" : "Next: Listening →"}
          </button>
        </div>
      </header>

      {/* Mobile pane switch — the reference is desktop-only, so this is ours */}
      <div className="hidden shrink-0 border-b border-border bg-bg-card max-lg:flex">
        {(["passage", "questions"] as const).map((pane) => (
          <button
            key={pane}
            onClick={() => setMobilePane(pane)}
            className={[
              "flex-1 px-4 py-2.5 text-sm font-semibold capitalize transition-colors",
              mobilePane === pane ? "border-b-2 border-primary text-primary" : "text-text-secondary",
            ].join(" ")}
          >
            {pane}
          </button>
        ))}
      </div>

      {/* Body — two panels on desktop, one at a time on small screens */}
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 overflow-hidden">
        {parts.map((part, i) => (
          <div
            key={part.passageId ?? i}
            // Hidden, never unmounted: this is what preserves answers and
            // highlights across Part switches.
            className={[i === activePart ? "flex" : "hidden", "min-h-0 w-full flex-1 overflow-hidden"].join(" ")}
          >
            {/* Passage */}
            <div
              ref={(el) => { passageRefs.current[i] = el; }}
              className={[
                "w-1/2 overflow-y-auto border-r border-border/60 px-8 py-6 max-lg:border-r-0 max-lg:p-6 max-md:p-4",
                mobilePane === "passage" ? "max-lg:w-full" : "max-lg:hidden",
              ].join(" ")}
            >
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-text-tertiary">
                Reading Passage {i + 1}
              </p>
              <h2 className="mb-4 text-xl font-bold tracking-tight text-text-primary">{part.title}</h2>
              {part.passage ? (
                <div className="whitespace-pre-line text-sm leading-[1.85] text-text-primary">{part.passage}</div>
              ) : (
                <p className="text-sm text-text-tertiary">No passage text available.</p>
              )}
            </div>

            {/* Questions — the whole Part, scrollable */}
            <div
              className={[
                "w-1/2 overflow-y-auto px-8 py-6 max-lg:p-6 max-md:p-4",
                mobilePane === "questions" ? "max-lg:w-full" : "max-lg:hidden",
              ].join(" ")}
            >
              {part.questions.map((q, qi) => {
                const prevGroup = qi > 0 ? part.questions[qi - 1].groupId : null;
                const startsGroup = q.groupId != null && q.groupId !== prevGroup;
                const isActive = q.id === activeQuestionId;
                return (
                  <div key={q.id}>
                    {startsGroup && qi > 0 && <div className="my-5 border-t border-border/60" />}
                    {/* The task instruction belongs to the group, so it is
                        rendered once at the group's first question -- never
                        repeated per question. */}
                    {startsGroup && q.groupInstructions && (
                      (() => {
                        const instruction = splitGroupInstructions(q.groupInstructions);
                        return (
                          <div className="mb-3 rounded-xl border border-border/70 bg-bg-muted px-4 py-3">
                            {instruction.range && <p className="text-xs font-semibold text-text-primary">{instruction.range}</p>}
                            {instruction.detail && (
                              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                                {instruction.detail}
                              </p>
                            )}
                          </div>
                        );
                      })()
                    )}
                    <div
                      id={`q-block-${q.id}`}
                      onFocusCapture={() => setActiveQuestionId(q.id)}
                      className={[
                        "mb-4 rounded-xl border p-4 transition-all",
                        isActive
                          ? "border-primary/40 bg-primary/[0.03] ring-2 ring-primary/30"
                          : "border-border/60 bg-bg-card ring-0",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-tertiary">
                          Question {q.sequenceNumber}
                        </span>
                        <button
                          onClick={() => toggleFlag(q.id)}
                          aria-label={flagged[q.id] ? "Remove flag" : "Flag question"}
                          className={[
                            "flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                            flagged[q.id] ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-bg-muted",
                          ].join(" ")}
                        >
                          <Flag className="h-3 w-3" aria-hidden="true" fill={flagged[q.id] ? "currentColor" : "none"} />
                          {flagged[q.id] ? "Flagged" : "Flag"}
                        </button>
                      </div>
                      <QuestionRenderer
                        question={q}
                        selectedAnswer={answers[q.id] ?? null}
                        onSelect={handleSelect}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <footer className="flex h-14 shrink-0 items-center border-t border-border/60 bg-bg-card shadow-[0_-8px_24px_rgba(15,23,42,0.04)]">
        <QuestionPalette
          questions={paletteQuestions}
          currentIndex={Math.max(0, flatIndex)}
          answers={answers}
          flags={flagged}
          groupLabelPrefix="P"
          onNavigate={(index) => goToQuestion(questions[index].id)}
          onPrev={goPrev}
          onNext={goNext}
        />
      </footer>
    </div>
  );
}
