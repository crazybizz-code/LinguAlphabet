"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Headphones,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Volume2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AssessmentQuestion } from "@/types/assessment";
import type { CefrLevel } from "@/types/content";

export type PracticeType = "reading" | "listening";

type Phase = "intro" | "audio" | "questions" | "submitting" | "result" | "no_questions" | "error";

interface PracticeResult {
  sessionId: string;
  questionCount: number;
  correctCount: number;
  scorePct: number;
  weakAreas: string[];
}

const TYPE_META: Record<PracticeType, { title: string; description: string; color: string; bg: string }> = {
  reading: {
    title: "Reading Practice",
    description: "Read each passage carefully and answer the comprehension questions.",
    color: "text-amber-500",
    bg: "bg-amber-50",
  },
  listening: {
    title: "Listening Practice",
    description: "The audio will play once. Listen carefully — there is no replay.",
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
};

const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

// ── Audio player (single-play, volume control only) ──────────────────────────

function ListeningAudioPlayer({ audioUrl, onEnded }: { audioUrl: string; onEnded: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [played, setPlayed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.volume = volume;
    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("ended", () => {
      setPlaying(false);
      onEnded();
    });
    return () => {
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  function handlePlay() {
    if (played || !audioRef.current) return;
    setPlayed(true);
    setPlaying(true);
    audioRef.current.play().catch(console.error);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500">
          <Headphones className="h-6 w-6 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">Audio Recording</p>
          {playing && duration > 0 && (
            <p className="mt-0.5 font-mono text-[11px] text-blue-600">
              {formatTime(currentTime)} / {formatTime(duration)}
            </p>
          )}
          {played && !playing && (
            <p className="text-xs text-text-secondary">Audio complete. You cannot replay it.</p>
          )}
          {!played && (
            <p className="text-xs text-text-secondary">Click to play. You can only listen once.</p>
          )}
        </div>
        <button
          onClick={handlePlay}
          disabled={played}
          className={[
            "shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all",
            played
              ? "cursor-not-allowed bg-bg-muted text-text-tertiary"
              : "bg-blue-500 text-white hover:bg-blue-600",
          ].join(" ")}
        >
          {played ? "Played" : "▶ Play"}
        </button>
      </div>

      {/* Volume control */}
      <div className="mt-3 flex items-center gap-3">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={handleVolumeChange}
          className="h-1.5 flex-1 cursor-pointer accent-blue-500"
          aria-label="Volume"
        />
        <span className="w-8 text-right text-[11px] tabular-nums text-text-tertiary">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}

// ── Option button ─────────────────────────────────────────────────────────────

function OptionButton({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full rounded-2xl border px-5 py-4 text-left text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary bg-primary-soft text-primary-strong shadow-sm"
          : "border-border bg-bg-card text-text-primary hover:border-primary/30",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <span className="w-12 text-right text-[11px] tabular-nums text-text-tertiary">
        {answered}/{total} done
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  practiceType: PracticeType;
  cefrLevel: CefrLevel;
  displayName: string;
}

export function PracticeSessionClient({ practiceType, cefrLevel, displayName }: Props) {
  const router = useRouter();
  const meta = TYPE_META[practiceType];

  const [phase, setPhase] = useState<Phase>("intro");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [audioEnded, setAudioEnded] = useState(false);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const firstAudioUrl = questions[0]?.audioUrl ?? null;

  // ── Start session ────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setErrorMsg(null);
    setPhase("submitting");
    try {
      const res = await fetch("/api/practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceType, targetCefrLevel: cefrLevel }),
      });
      const data = await res.json() as { sessionId?: string; questions?: AssessmentQuestion[]; error?: string };
      if (!res.ok) {
        if ((data.error ?? "").toLowerCase().includes("no questions")) {
          setPhase("no_questions");
        } else {
          setErrorMsg(data.error ?? "Failed to start session");
          setPhase("error");
        }
        return;
      }
      setSessionId(data.sessionId!);
      setQuestions(data.questions!);
      setCurrentIndex(0);
      setAnswers({});
      setAudioEnded(false);

      if (practiceType === "listening" && data.questions![0]?.audioUrl) {
        setPhase("audio");
      } else {
        setPhase("questions");
      }
    } catch {
      setErrorMsg("Connection error — please check your network and try again.");
      setPhase("error");
    }
  }, [practiceType, cefrLevel]);

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!sessionId) return;
    setPhase("submitting");
    setErrorMsg(null);
    try {
      const responses = questions.map((q) => ({
        questionId: q.id,
        userAnswer: answers[q.id] ?? null,
        timeTakenSeconds: null,
      }));
      const res = await fetch("/api/practice/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, responses }),
      });
      const data = await res.json() as PracticeResult & { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Submit failed");
        setPhase("questions");
        return;
      }
      setResult(data);
      setPhase("result");
    } catch {
      setErrorMsg("Submit failed — please try again.");
      setPhase("questions");
    }
  }, [sessionId, questions, answers]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const Icon = practiceType === "listening" ? Headphones : BookOpen;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 md:py-10">
      {/* Back link */}
      <button
        onClick={() => {
          if (phase === "result" || phase === "no_questions" || phase === "error") {
            router.push("/practice");
          } else if (phase === "intro") {
            router.push("/practice");
          } else {
            router.back();
          }
        }}
        className="mb-6 flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Practice
      </button>

      <AnimatePresence mode="wait">
        {/* ── Intro ──────────────────────────────────────────────────────────── */}
        {phase === "intro" && (
          <motion.div key="intro" {...fadeSlide} className="flex flex-col items-center text-center">
            <div className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${meta.bg}`}>
              <Icon className={`h-9 w-9 ${meta.color}`} aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-text-primary">{meta.title}</h1>
            <p className="mb-2 max-w-md text-sm text-text-secondary">{meta.description}</p>
            <p className="mb-8 text-xs text-text-tertiary">
              5–10 questions · graded instantly · level {cefrLevel}
            </p>
            {practiceType === "listening" && (
              <div className="mb-8 max-w-sm rounded-2xl border border-border bg-bg-card p-4 text-left shadow-sm">
                <p className="text-xs font-semibold text-text-primary">Listening rules</p>
                <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                  <li className="flex gap-2"><span className="text-blue-500">•</span> The audio plays once — no replay.</li>
                  <li className="flex gap-2"><span className="text-blue-500">•</span> No transcript is shown during the session.</li>
                  <li className="flex gap-2"><span className="text-blue-500">•</span> You can adjust the volume before playing.</li>
                </ul>
              </div>
            )}
            <Button variant="primary" className="h-12 rounded-full px-8" onClick={handleStart}>
              Start Session
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {/* ── Audio phase (listening only) ────────────────────────────────────── */}
        {phase === "audio" && firstAudioUrl && (
          <motion.div key="audio" {...fadeSlide} className="space-y-6">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-500">
                Listening Practice
              </p>
              <h2 className="text-xl font-bold text-text-primary">Listen carefully</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Play the audio below. You can only listen once. Answer the questions after the audio ends.
              </p>
            </div>

            <ListeningAudioPlayer
              audioUrl={firstAudioUrl}
              onEnded={() => setAudioEnded(true)}
            />

            {audioEnded && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end"
              >
                <Button
                  variant="primary"
                  className="h-11 rounded-xl px-6"
                  onClick={() => setPhase("questions")}
                >
                  Answer Questions
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            )}

            {!audioEnded && (
              <p className="text-center text-xs text-text-tertiary">
                Play the audio above, then questions will appear.
              </p>
            )}
          </motion.div>
        )}

        {/* ── Questions ────────────────────────────────────────────────────────── */}
        {phase === "questions" && currentQuestion && (
          <motion.div key={`q-${currentQuestion.id}`} {...fadeSlide} className="space-y-5">
            {/* Header */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${meta.bg} ${meta.color}`}>
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {meta.title}
                </span>
                <span className="text-[11px] text-text-tertiary tabular-nums">
                  {currentIndex + 1} of {questions.length}
                </span>
              </div>
              <ProgressBar answered={answeredCount} total={questions.length} />
            </div>

            {/* Passage (reading only) */}
            {currentQuestion.passage && (
              <div className="max-h-64 overflow-y-auto rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
                {currentQuestion.passageTitle && (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                    {currentQuestion.passageTitle}
                  </p>
                )}
                <p className="text-sm leading-relaxed text-text-primary">{currentQuestion.passage}</p>
              </div>
            )}

            {/* Question card */}
            <div className="rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
              <p className="text-sm font-semibold leading-snug text-text-primary">
                {currentQuestion.question}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              {(currentQuestion.options ?? []).map((opt) => (
                <OptionButton
                  key={opt}
                  label={opt}
                  selected={answers[currentQuestion.id] === opt}
                  onSelect={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }))}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition-all hover:border-primary/40 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentIndex((i) => i + 1)}
                  className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition-all hover:border-primary/40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!allAnswered}
                  className={[
                    "flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
                    allAnswered
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "cursor-not-allowed bg-bg-muted text-text-tertiary",
                  ].join(" ")}
                >
                  Submit
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {errorMsg && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
                {errorMsg}
              </p>
            )}

            {/* All answered — show submit CTA */}
            {allAnswered && currentIndex < questions.length - 1 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center"
              >
                <button
                  onClick={handleSubmit}
                  className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  All answered — Submit now
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── Submitting ────────────────────────────────────────────────────────── */}
        {phase === "submitting" && (
          <motion.div key="submitting" {...fadeSlide} className="flex flex-col items-center text-center py-20">
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-2.5 w-2.5 rounded-full bg-primary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
            <p className="mt-4 text-sm text-text-secondary">Grading your answers…</p>
          </motion.div>
        )}

        {/* ── Result ────────────────────────────────────────────────────────────── */}
        {phase === "result" && result && (
          <motion.div key="result" {...fadeSlide} className="space-y-6">
            <div className="rounded-[2rem] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-8 text-center shadow-lg">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                Session Complete
              </p>
              <p className="mt-3 text-6xl font-black text-white">
                {Math.round(result.scorePct)}
                <span className="text-3xl text-white/60">%</span>
              </p>
              <p className="mt-1 text-sm text-white/60">
                {result.correctCount} correct out of {result.questionCount}
              </p>

              {/* Performance label */}
              <div className="mt-4 inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white">
                {result.scorePct >= 80
                  ? "Excellent work!"
                  : result.scorePct >= 60
                  ? "Good effort — keep going!"
                  : "Keep practising — you'll improve!"}
              </div>
            </div>

            {result.weakAreas.length > 0 && (
              <div className="rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-text-primary">Areas to focus on</p>
                <ul className="space-y-1.5">
                  {result.weakAreas.map((area) => (
                    <li key={area} className="flex items-center gap-2 text-sm text-text-secondary">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      {area.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                variant="primary"
                className="h-12 rounded-xl px-8"
                onClick={handleStart}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Practice Again
              </Button>
              <Button
                variant="secondary"
                className="h-12 rounded-xl px-8"
                onClick={() => router.push("/dashboard")}
              >
                Back to Dashboard
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── No questions available ────────────────────────────────────────────── */}
        {phase === "no_questions" && (
          <motion.div key="no_questions" {...fadeSlide} className="flex flex-col items-center py-20 text-center">
            <div className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full ${meta.bg}`}>
              <Icon className={`h-8 w-8 ${meta.color}`} aria-hidden="true" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-text-primary">
              No questions available yet
            </h2>
            <p className="mb-6 max-w-sm text-sm text-text-secondary">
              Practice questions for your level are being added. Check back soon, {displayName}!
            </p>
            <Button variant="secondary" className="h-11 rounded-xl px-6" onClick={() => router.push("/practice")}>
              Back to Practice
            </Button>
          </motion.div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────────────── */}
        {phase === "error" && (
          <motion.div key="error" {...fadeSlide} className="flex flex-col items-center py-20 text-center">
            <XCircle className="mb-4 h-12 w-12 text-red-400" aria-hidden="true" />
            <h2 className="mb-2 text-lg font-bold text-text-primary">Something went wrong</h2>
            <p className="mb-6 max-w-sm text-sm text-text-secondary">{errorMsg}</p>
            <div className="flex gap-3">
              <Button variant="primary" className="h-11 rounded-xl px-6" onClick={() => setPhase("intro")}>
                Try Again
              </Button>
              <Button variant="secondary" className="h-11 rounded-xl px-6" onClick={() => router.push("/practice")}>
                Back
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
