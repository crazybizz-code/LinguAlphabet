"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { QuestionRenderer } from "./QuestionRenderer";
import { PassageHighlighter } from "./PassageHighlighter";
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
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* Header */}
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-card px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F172A]">
            <BookOpen className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <span className="hidden truncate text-sm font-semibold text-text-primary sm:block">Full Mock · Reading</span>
          <span className="hidden text-xs text-text-tertiary md:block">{answeredCount}/{questions.length} answered</span>
        </div>

        <div className="flex items-center gap-3">
          <PassageHighlighter getContainer={getActivePassage} containerKey={activePart} />
          <span
            className={["font-mono text-lg font-bold tabular-nums", isLowTime ? "text-red-500" : "text-text-primary"].join(" ")}
            aria-live="polite"
            aria-label={`Time remaining: ${formatTime(timeLeft)}`}
          >
            {formatTime(timeLeft)}
          </span>
          <button
            onClick={handleFinish}
            disabled={finishing}
            className="rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
          >
            {readingOnly ? "Finish" : "Next: Listening →"}
          </button>
        </div>
      </header>

      {/* Mobile pane switch — the reference is desktop-only, so this is ours */}
      <div className="flex shrink-0 border-b border-border bg-bg-card lg:hidden">
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
                "overflow-y-auto p-5 sm:p-6 lg:w-1/2 lg:border-r lg:border-border/60",
                mobilePane === "passage" ? "w-full" : "hidden lg:block",
              ].join(" ")}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Reading Passage {i + 1}
              </p>
              <h2 className="mb-4 text-lg font-bold text-text-primary">{part.title}</h2>
              {part.passage ? (
                <div className="whitespace-pre-line text-sm leading-[1.85] text-text-primary">{part.passage}</div>
              ) : (
                <p className="text-sm text-text-tertiary">No passage text available.</p>
              )}
            </div>

            {/* Questions — the whole Part, scrollable */}
            <div
              className={[
                "overflow-y-auto p-5 sm:p-6 lg:w-1/2",
                mobilePane === "questions" ? "w-full" : "hidden lg:block",
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
                      <div className="mb-3 rounded-xl border border-border/60 bg-surface-secondary/60 px-4 py-3">
                        <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-text-primary">
                          {q.groupInstructions}
                        </p>
                      </div>
                    )}
                    <div
                      id={`q-block-${q.id}`}
                      onFocusCapture={() => setActiveQuestionId(q.id)}
                      className={[
                        "mb-4 rounded-xl p-3 transition-shadow",
                        isActive ? "outline outline-2 outline-primary" : "outline-none",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                          Question {q.sequenceNumber}
                        </span>
                        <button
                          onClick={() => toggleFlag(q.id)}
                          aria-label={flagged[q.id] ? "Remove flag" : "Flag question"}
                          className={[
                            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all",
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

      {/* Part tabs + palette */}
      <footer className="shrink-0 border-t border-border/60 bg-bg-card">
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
          <button
            onClick={goPrev}
            disabled={flatIndex <= 0}
            aria-label="Previous question"
            className="shrink-0 rounded-lg border border-border p-1.5 text-text-secondary disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {parts.map((part, i) => {
            const done = countAnsweredQuestions(part.questions, answers);
            const selected = i === activePart;
            return (
              <div key={part.passageId ?? i} className="flex shrink-0 items-center gap-1.5" role="tablist">
                <button
                  role="tab"
                  aria-selected={selected}
                  onClick={() => goToQuestion(part.questions[0].id)}
                  className={[
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                    selected ? "bg-primary text-white" : "text-text-secondary hover:bg-bg-muted",
                  ].join(" ")}
                >
                  <span>Part {i + 1}</span>
                  <span className={selected ? "text-white/80" : "text-text-tertiary"}>
                    {done} of {part.questions.length}
                  </span>
                </button>

                {selected && (
                  <div className="flex items-center gap-1">
                    {part.questions.map((q) => {
                      const isAnswered = answers[q.id] != null && answers[q.id] !== "";
                      const isActive = q.id === activeQuestionId;
                      return (
                        <button
                          key={q.id}
                          onClick={() => goToQuestion(q.id)}
                          aria-label={`Question ${q.sequenceNumber}${isAnswered ? ", answered" : ", not answered"}`}
                          aria-current={isActive ? "true" : undefined}
                          className={[
                            "h-7 w-7 rounded-md text-[11px] font-semibold transition-all",
                            isActive ? "ring-2 ring-primary ring-offset-1" : "",
                            isAnswered ? "bg-primary/15 text-primary" : "border border-border text-text-tertiary",
                            flagged[q.id] ? "underline decoration-2" : "",
                          ].join(" ")}
                        >
                          {q.sequenceNumber}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={goNext}
            disabled={flatIndex >= questions.length - 1}
            aria-label="Next question"
            className="shrink-0 rounded-lg border border-border p-1.5 text-text-secondary disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </footer>
    </div>
  );
}
