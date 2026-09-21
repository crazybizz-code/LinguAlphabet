"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Headphones, Monitor } from "lucide-react";
import Link from "next/link";
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
  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const isLowTime = timeLeft <= 300;

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
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F172A]">
              <Headphones className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-text-primary">Full Mock · Listening</span>
            <span className="text-xs text-text-tertiary">
              {answeredCount}/{questions.length} answered
            </span>
          </div>

          <span
            className={[
              "font-mono text-lg font-bold tabular-nums",
              isLowTime ? "text-red-500" : "text-text-primary",
            ].join(" ")}
            aria-live="polite"
          >
            {formatTime(timeLeft)}
          </span>

          <div className="flex items-center gap-2">
            {submitError && (
              <span className="text-xs text-red-500">{submitError}</span>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit Mock"}
            </button>
          </div>
        </header>

        {/* Content */}
        {currentQuestion && activeSection && currentLocation && (
          <div className="flex min-h-0 flex-1 overflow-y-auto">
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

        {/* Palette footer — 70 px */}
        <footer className="flex h-[70px] shrink-0 items-center border-t border-border/60 bg-bg-card">
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
    </>
  );
}
