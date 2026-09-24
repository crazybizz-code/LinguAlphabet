"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Headphones } from "lucide-react";
import { ListeningSectionPanel } from "./ListeningSectionPanel";
import { QuestionPalette } from "./QuestionPalette";
import {
  flattenListeningQuestions,
  getListeningLocation,
  type ClientListeningQuestionGroup,
  type ClientListeningSection,
} from "./listening-state";
import { encodeChooseTwoResponses } from "./listening-choose-two";
import { ListeningSaveCoordinator } from "./listening-save-coordinator";

interface Props {
  attemptId: string;
  sections: ClientListeningSection[];
  savedAnswers: Record<string, string | null>;
  timeLimitSeconds: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MockListeningClient({ attemptId, sections, savedAnswers, timeLimitSeconds }: Props) {
  const router = useRouter();
  const questions = useMemo(() => flattenListeningQuestions(sections), [sections]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>(savedAnswers);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // This intentionally lives only for the mounted exam session. It preserves
  // one-play behavior while moving between sections, but a browser refresh
  // resets it because Checkpoint 2 adds no server/database persistence.
  const [playedAudioSectionIds, setPlayedAudioSectionIds] = useState<Set<string>>(new Set());
  // Mark-for-review flags — session-only (sessionStorage), no schema change; mirrors the
  // existing timer-anchor persistence pattern below.
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const startTimeRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);
  const chooseTwoSaveQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
  const saveCoordinatorRef = useRef(new ListeningSaveCoordinator());
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousSectionIdRef = useRef<string | null>(null);

  // The exam shell is server-rendered, so reading sessionStorage inside the
  // useState initializer is not reliable on a hard reload: React hydrates the
  // server's empty snapshot. Restore review flags after mount instead. This
  // remains session-only and does not introduce a database contract.
  useEffect(() => {
    const restoreId = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(`mock_listening_flags_${attemptId}`);
        setFlagged(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
      } catch {
        setFlagged({});
      }
    }, 0);
    return () => window.clearTimeout(restoreId);
  }, [attemptId]);

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
    (questionId: string, answer: string | null) => {
      const q = questions.find((q) => q.id === questionId);
      if (!q) return;
      const operation = fetch("/api/mock/answer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          questionId,
          section: "listening",
          userAnswer: answer,
          sequenceNumber: q.sequenceNumber,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? "Failed to save Listening answer");
        }
      });
      const tracked = saveCoordinatorRef.current.track(operation);
      // Keep the existing non-blocking autosave interaction. The tracked
      // rejection is still observed here, while handleSubmit() separately
      // drains the coordinator and refuses to submit after a failed save.
      void tracked.catch(console.error);
      return tracked;
    },
    [attemptId, questions],
  );

  function handleSelect(questionId: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    void saveAnswer(questionId, answer);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    sessionStorage.removeItem(`mock_listening_start_${attemptId}`);
    sessionStorage.removeItem(`mock_listening_flags_${attemptId}`);
    try {
      // A choose-two snapshot may be queued behind an older snapshot and
      // therefore not yet have started its two HTTP requests. Await the
      // queue tails first, then every ordinary/grouped request currently in
      // flight. Submission never races the last answer.
      await Promise.all([...chooseTwoSaveQueuesRef.current.values()]);
      await saveCoordinatorRef.current.drain();
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

  const currentLocation = getListeningLocation(sections, currentIndex);
  const currentQuestion = currentLocation?.question;
  const activeSection = currentLocation?.section;
  const activeSectionId = activeSection?.sectionId ?? null;
  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const isLowTime = timeLeft <= 300;

  useEffect(() => {
    if (activeSectionId && previousSectionIdRef.current && previousSectionIdRef.current !== activeSectionId) {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    previousSectionIdRef.current = activeSectionId;
  }, [activeSectionId]);

  function navigateToQuestion(questionId: string) {
    const index = questions.findIndex((question) => question.id === questionId);
    if (index >= 0) setCurrentIndex(index);
  }

  function handleChooseTwoChange(group: ClientListeningQuestionGroup, selections: string[]) {
    const updates = encodeChooseTwoResponses(group, selections);
    setAnswers((previous) => {
      const next = { ...previous };
      for (const update of updates) next[update.questionId] = update.answer;
      return next;
    });
    // Queue whole group snapshots so rapid toggles cannot let an older null
    // response arrive after a newer selection. Each snapshot still uses the
    // existing one-row API and response schema.
    const queueKey = updates.map((update) => update.questionId).join(":");
    const previousSave = chooseTwoSaveQueuesRef.current.get(queueKey) ?? Promise.resolve();
    const nextSave = previousSave.then(async () => {
      await Promise.all(updates.map((update) => saveAnswer(update.questionId, update.answer)));
    });
    chooseTwoSaveQueuesRef.current.set(queueKey, nextSave);
    void nextSave.finally(() => {
      if (chooseTwoSaveQueuesRef.current.get(queueKey) === nextSave) {
        chooseTwoSaveQueuesRef.current.delete(queueKey);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-bg">
        <header className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/80 bg-bg-card px-6 max-md:h-14 max-md:px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F172A]">
              <Headphones className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <span className="truncate text-sm font-semibold text-text-primary max-md:hidden">Full Mock · Listening</span>
            <span className="text-xs text-text-tertiary max-lg:hidden">
              {answeredCount}/{questions.length} answered
            </span>
          </div>

          <span
            className={[
              "font-mono text-lg font-bold tabular-nums max-md:text-base",
              isLowTime ? "text-red-500" : "text-text-primary",
            ].join(" ")}
            aria-live="polite"
            aria-label={`Time remaining: ${formatTime(timeLeft)}`}
          >
            {formatTime(timeLeft)}
          </span>

          <div className="flex min-w-0 items-center justify-end gap-2">
            {submitError && (
              <span className="max-w-48 truncate text-xs text-red-500 max-lg:hidden">{submitError}</span>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="min-h-9 shrink-0 rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 max-md:px-3 max-md:text-xs"
            >
              {submitting ? "Submitting…" : "Submit Mock"}
            </button>
          </div>
        </header>

        {/* Content */}
        {currentQuestion && activeSection && currentLocation && (
          <div ref={contentRef} className="flex min-h-0 flex-1 overflow-y-auto scroll-smooth">
            <ListeningSectionPanel
              section={activeSection}
              sectionNumber={currentLocation.sectionIndex + 1}
              currentQuestionId={currentQuestion.id}
              answers={answers}
              flags={flagged}
              audioAlreadyPlayed={playedAudioSectionIds.has(activeSection.sectionId)}
              onAudioPlay={() => setPlayedAudioSectionIds((prev) => new Set([...prev, activeSection.sectionId]))}
              onSelect={handleSelect}
              onChooseTwoChange={handleChooseTwoChange}
              onNavigate={navigateToQuestion}
              onToggleFlag={toggleFlag}
            />
          </div>
        )}

        <footer className="flex h-14 shrink-0 items-center border-t border-border/60 bg-bg-card shadow-[0_-8px_24px_rgba(15,23,42,0.04)]">
          <QuestionPalette
            questions={questions}
            currentIndex={currentIndex}
            answers={answers}
            flags={flagged}
            onNavigate={setCurrentIndex}
            onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            onNext={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
          />
        </footer>
    </div>
  );
}
