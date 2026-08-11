"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Headphones, Clock, ArrowRight, CheckCircle, ChevronRight } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { Button } from "@/components/ui/Button";
import type {
  AssessmentPhase,
  AssessmentQuestion,
  PlacementResult,
  StartResponse,
  AnswerResponse,
} from "@/types/assessment";

// ── Constants ───────────────────────────────────────────────────────────────

const CEFR_TO_LABEL: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficiency",
};

const LEVEL_COLORS: Record<string, string> = {
  A1: "text-level-a1",
  A2: "text-level-a2",
  B1: "text-level-b1",
  B2: "text-level-b2",
  C1: "text-level-c1",
  C2: "text-level-c2",
};

// ── Shared animation variants ────────────────────────────────────────────────

const fadeSlideIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({
  answered,
  estimated,
}: {
  answered: number;
  estimated: number;
}) {
  const pct = Math.min(100, Math.round((answered / estimated) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="w-10 text-right text-caption text-text-tertiary tabular-nums">
        {answered}/{estimated}
      </span>
    </div>
  );
}

function PassageCard({ passage, title, skill }: { passage: string; title: string | null; skill: "reading" | "listening" }) {
  const isListening = skill === "listening";
  return (
    <div className="rounded-card border border-border bg-bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        {isListening ? (
          <Headphones className="h-4 w-4 text-text-tertiary" aria-hidden />
        ) : (
          <BookOpen className="h-4 w-4 text-text-tertiary" aria-hidden />
        )}
        <span className="text-caption font-semibold uppercase tracking-wide text-text-tertiary">
          {isListening ? "Audio Transcript" : title ?? "Reading Passage"}
        </span>
      </div>
      {isListening && (
        <p className="mb-3 rounded-md bg-bg-muted px-3 py-2 text-caption text-text-secondary">
          🎧 Audio coming soon — read the transcript below as you would listen.
        </p>
      )}
      <p className="text-body leading-relaxed text-text-primary">{passage}</p>
    </div>
  );
}

function OptionButton({
  label,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={[
        "w-full rounded-[1.25rem] border px-5 py-4 text-left text-body font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary bg-primary-soft text-primary-strong shadow-sm"
          : "border-border bg-bg-card text-text-primary hover:border-primary/30 hover:bg-primary-soft-2",
        disabled && !selected ? "opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

// ── Phase screens ─────────────────────────────────────────────────────────────

function IntroScreen({ displayName, onStart }: { displayName: string; onStart: () => void }) {
  return (
    <motion.div {...fadeSlideIn} className="flex flex-col items-center text-center">
      <Tuto pose="thinking" size="lg" animation="floatSm" priority className="mb-8" />
      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">
        Placement Assessment
      </p>
      <h1 className="mb-3 font-heading text-display font-extrabold text-text-primary">
        {displayName ? `Let's find your real level, ${displayName}` : "Let's find your real level"}
      </h1>
      <p className="mb-8 max-w-md text-body leading-relaxed text-text-secondary">
        Answer a short set of Reading and Listening questions. Tuto will use your
        responses to find your actual level — not just the one you reported.
      </p>

      <div className="mb-8 flex flex-wrap justify-center gap-3">
        {[
          { icon: BookOpen, label: "Reading" },
          { icon: Headphones, label: "Listening" },
          { icon: Clock, label: "~15 minutes" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 py-2 text-small font-medium text-text-secondary shadow-sm"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </span>
        ))}
      </div>

      <div className="mb-8 max-w-sm rounded-card border border-border bg-bg-card p-5 text-left shadow-sm">
        <p className="mb-3 text-small font-semibold text-text-primary">A few things to know:</p>
        <ul className="space-y-2 text-small text-text-secondary">
          <li className="flex gap-2"><span className="shrink-0 text-primary">•</span> No right or wrong strategy — just answer honestly.</li>
          <li className="flex gap-2"><span className="shrink-0 text-primary">•</span> The questions adapt as you go — don&apos;t worry if some feel hard.</li>
          <li className="flex gap-2"><span className="shrink-0 text-primary">•</span> Your result is a LinguABC estimate, not an official IELTS score.</li>
        </ul>
      </div>

      <Button variant="primary" className="h-14 rounded-full px-10 text-body" onClick={onStart}>
        Start Assessment
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </motion.div>
  );
}

function SectionTransition({
  skill,
  onContinue,
}: {
  skill: "reading" | "listening";
  onContinue: () => void;
}) {
  return (
    <motion.div {...fadeSlideIn} className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary-lighter">
        {skill === "listening" ? (
          <Headphones className="h-9 w-9 text-primary" />
        ) : (
          <BookOpen className="h-9 w-9 text-primary" />
        )}
      </div>
      <h2 className="mb-3 font-heading text-h1 font-extrabold text-text-primary">
        {skill === "listening" ? "Now: Listening" : "Now: Reading"}
      </h2>
      <p className="mb-8 max-w-sm text-body text-text-secondary">
        {skill === "listening"
          ? "You'll read a transcript and answer comprehension questions — the same skills as real listening tasks."
          : "Read each passage carefully before answering."}
      </p>
      <Button variant="primary" className="h-12 rounded-full px-8" onClick={onContinue}>
        Continue
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </motion.div>
  );
}

function QuestionScreen({
  question,
  answered,
  estimated,
  onAnswer,
  loading,
}: {
  question: AssessmentQuestion;
  answered: number;
  estimated: number;
  onAnswer: (answer: string) => void;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const options = question.options ?? [];
  const startRef = useRef(Date.now());

  const handleSelect = useCallback(
    (opt: string) => {
      if (loading || selected) return;
      setSelected(opt);
      // Small delay for visual feedback before submitting
      setTimeout(() => {
        onAnswer(opt);
      }, 300);
    },
    [loading, selected, onAnswer],
  );

  return (
    <motion.div key={question.id} {...fadeSlideIn} className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-3 py-1 text-caption font-semibold text-text-secondary">
            {question.skill === "listening" ? (
              <><Headphones className="h-3 w-3" aria-hidden /> Listening</>
            ) : (
              <><BookOpen className="h-3 w-3" aria-hidden /> Reading</>
            )}
          </span>
        </div>
        <ProgressBar answered={answered} estimated={estimated} />
      </div>

      {/* Passage */}
      {question.passage && (
        <PassageCard
          passage={question.passage}
          title={question.passageTitle}
          skill={question.skill}
        />
      )}

      {/* Question */}
      <div className="rounded-card border border-border bg-bg-card p-5 shadow-sm sm:p-6">
        <p className="text-body font-semibold leading-snug text-text-primary">{question.question}</p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            label={opt}
            selected={selected === opt}
            onSelect={() => handleSelect(opt)}
            disabled={loading || selected !== null}
          />
        ))}
      </div>
    </motion.div>
  );
}

function AnalysingScreen() {
  return (
    <motion.div {...fadeSlideIn} className="flex flex-col items-center text-center">
      <Tuto pose="thinking" size="lg" animation="floatSm" priority className="mb-8" />
      <h2 className="mb-3 font-heading text-h1 font-extrabold text-text-primary">
        Analysing your responses…
      </h2>
      <p className="mb-8 max-w-sm text-body text-text-secondary">
        Tuto is working out your level and building your personalised plan.
      </p>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-primary"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function ResultScreen({
  result,
  onDone,
  planGenerating,
}: {
  result: PlacementResult;
  onDone: () => void;
  planGenerating: boolean;
}) {
  const overallLabel = CEFR_TO_LABEL[result.overallCefrLevel] ?? result.overallCefrLevel;
  const overallColor = LEVEL_COLORS[result.overallCefrLevel] ?? "text-text-primary";

  return (
    <motion.div {...fadeSlideIn} className="flex flex-col items-center text-center">
      <Tuto pose="celebrating" size="lg" animation="float" priority className="mb-6" />

      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">
        Your LinguABC Estimated Level
      </p>
      <h1 className="mb-1 font-heading text-display font-extrabold text-text-primary">
        <span className={overallColor}>{result.overallCefrLevel}</span>
        {" "}— {overallLabel}
      </h1>
      <p className="mb-6 text-small text-text-tertiary">
        Estimated band: <strong className="text-text-secondary">{result.estimatedBand.toFixed(1)}</strong>
        {" "}· This is a LinguABC estimate, not an official IELTS score.
      </p>

      {/* Skill breakdown */}
      <div className="mb-6 grid w-full max-w-sm grid-cols-2 gap-3">
        {[
          { label: "Reading", level: result.readingLevel },
          { label: "Listening", level: result.listeningLevel },
        ].map(({ label, level }) => (
          <div
            key={label}
            className="rounded-card border border-border bg-bg-card p-4 shadow-sm"
          >
            <p className="mb-1 text-caption text-text-tertiary">{label}</p>
            <p className={`font-heading text-h2 font-extrabold ${LEVEL_COLORS[level] ?? ""}`}>
              {level}
            </p>
            <p className="text-caption text-text-secondary">{CEFR_TO_LABEL[level]}</p>
          </div>
        ))}
      </div>

      {/* Weak areas */}
      {result.weakAreas.length > 0 && (
        <div className="mb-6 w-full max-w-sm rounded-card border border-border bg-bg-card p-5 text-left shadow-sm">
          <p className="mb-3 text-small font-semibold text-text-primary">Tuto identified:</p>
          <ul className="space-y-2">
            {result.weakAreas.map((area) => (
              <li key={area} className="flex items-center gap-2 text-small text-text-secondary">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {area.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-text-tertiary">
            Your plan will focus on these areas.
          </p>
        </div>
      )}

      <Button
        variant="primary"
        className="h-14 rounded-full px-10 text-body"
        loading={planGenerating}
        onClick={onDone}
      >
        {planGenerating ? "Building your plan…" : "See My Learning Plan"}
        {!planGenerating && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
      <p className="mt-4 text-caption text-text-tertiary">
        Tuto is building your 28-day personalised plan.
      </p>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  displayName: string;
}

export function PlacementAssessmentView({ displayName }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<AssessmentPhase>("intro");
  const [currentQuestion, setCurrentQuestion] = useState<AssessmentQuestion | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [estimatedTotal, setEstimatedTotal] = useState(14);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [planGenerating, setPlanGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionStartRef = useRef<number>(Date.now());

  // Track which skill the current question belongs to so we can show section transitions
  const [currentSkill, setCurrentSkill] = useState<"reading" | "listening">("reading");
  const [pendingSectionTransition, setPendingSectionTransition] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/placement/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start assessment");
      const data: StartResponse = await res.json();
      setAttemptId(data.attemptId);
      setCurrentQuestion(data.firstQuestion);
      setEstimatedTotal(data.estimatedTotal);
      setCurrentSkill(data.firstQuestion.skill);
      setQuestionsAnswered(0);
      questionStartRef.current = Date.now();
      setPhase("question");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAnswer = useCallback(
    async (answer: string) => {
      if (!attemptId || !currentQuestion) return;
      setLoading(true);
      setError(null);

      const timeTaken = Math.round((Date.now() - questionStartRef.current) / 1000);

      try {
        const res = await fetch("/api/assessment/placement/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            questionId: currentQuestion.id,
            userAnswer: answer,
            timeTakenSeconds: timeTaken,
          }),
        });
        if (!res.ok) throw new Error("Failed to record answer");
        const data: AnswerResponse = await res.json();

        if (data.done) {
          // Assessment complete — show analysing screen, then result
          setPhase("analysing");
          setResult(data.result);
          // Kick off finalise + plan generation in the background
          fetch("/api/assessment/placement/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId }),
          }).catch(() => {
            /* non-fatal — retry on result screen */
          });
          // Show analysing screen for 2.5s then reveal result
          setTimeout(() => setPhase("result"), 2500);
        } else {
          setQuestionsAnswered(data.questionsAnswered);
          setEstimatedTotal(data.estimatedTotal);

          // Show a section transition if the skill changes
          if (data.nextQuestion.skill !== currentSkill) {
            setCurrentSkill(data.nextQuestion.skill);
            setPendingSectionTransition(true);
            setCurrentQuestion(data.nextQuestion);
            const transitionPhase = data.nextQuestion.skill === "listening" ? "listening_intro" : "reading_intro";
            setPhase(transitionPhase);
          } else {
            setCurrentQuestion(data.nextQuestion);
            questionStartRef.current = Date.now();
          }
        }
      } catch {
        setError("Connection issue — please check your network and try again.");
      } finally {
        setLoading(false);
      }
    },
    [attemptId, currentQuestion, currentSkill],
  );

  const handleSectionContinue = useCallback(() => {
    setPendingSectionTransition(false);
    questionStartRef.current = Date.now();
    setPhase("question");
  }, []);

  const handleDone = useCallback(async () => {
    if (!result) return;
    setPlanGenerating(true);
    // Give the background /complete call a moment to finish, then navigate
    await new Promise((r) => setTimeout(r, 1200));
    router.push("/dashboard");
  }, [result, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-bg px-5 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        {/* Logo / back link */}
        <div className="mb-8 flex items-center justify-between">
          <span className="font-heading text-lg font-extrabold text-text-primary">
            Lingu<span className="text-primary">ABC</span>
          </span>
          {phase === "question" && (
            <span className="text-caption text-text-tertiary">
              <Clock className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              ~{Math.max(1, Math.round(((estimatedTotal - questionsAnswered) * 65) / 60))} min left
            </span>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-small text-danger">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {phase === "intro" && (
            <motion.div key="intro" {...fadeSlideIn}>
              <IntroScreen displayName={displayName} onStart={handleStart} />
            </motion.div>
          )}

          {(phase === "reading_intro" || phase === "listening_intro") && (
            <motion.div key="section-transition" {...fadeSlideIn}>
              <SectionTransition
                skill={phase === "listening_intro" ? "listening" : "reading"}
                onContinue={handleSectionContinue}
              />
            </motion.div>
          )}

          {phase === "question" && currentQuestion && (
            <motion.div key={`q-${currentQuestion.id}`} {...fadeSlideIn}>
              <QuestionScreen
                question={currentQuestion}
                answered={questionsAnswered}
                estimated={estimatedTotal}
                onAnswer={handleAnswer}
                loading={loading}
              />
            </motion.div>
          )}

          {phase === "analysing" && (
            <motion.div key="analysing" {...fadeSlideIn}>
              <AnalysingScreen />
            </motion.div>
          )}

          {phase === "result" && result && (
            <motion.div key="result" {...fadeSlideIn}>
              <ResultScreen
                result={result}
                onDone={handleDone}
                planGenerating={planGenerating}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state during start */}
        {loading && phase === "intro" && (
          <div className="mt-6 text-center">
            <div className="inline-flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-2 w-2 rounded-full bg-primary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
