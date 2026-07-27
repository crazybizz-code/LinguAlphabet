"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  Target,
  CalendarDays,
  TrendingUp,
  BookOpen,
  BookText,
  Headphones,
  Mic,
  PenLine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Tuto } from "@/components/mascot/Tuto";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { Timeline } from "@/components/ui/Timeline";
import { readOnboardingData, clearOnboardingData } from "@/lib/onboarding/storage";

const NEXT_LEVEL: Record<string, string> = { A1: "A2", A2: "B1", B1: "B2", B2: "C1", C1: "C2", C2: "Mastery" };
const VOCAB_TARGET: Record<string, number> = { A1: 500, A2: 1000, B1: 2000, B2: 4000, C1: 6000, C2: 8000 };

const LOADING_CHECKLIST = [
  { label: "English Level", delay: 0.2 },
  { label: "Learning Goal", delay: 0.6 },
  { label: "Daily Time", delay: 1 },
  { label: "Interests", delay: 1.4 },
];

const SKILLS_SCHEDULE = [
  { name: "Reading", icon: BookText, schedule: "Mon, Wed, Fri" },
  { name: "Listening", icon: Headphones, schedule: "Tue, Thu" },
  { name: "Speaking", icon: Mic, schedule: "Wed, Sat" },
  { name: "Grammar", icon: PenLine, schedule: "Mon, Thu" },
];

const ROADMAP = [
  { week: "Week 1–2", goal: "Build vocabulary foundation & core grammar" },
  { week: "Week 3–4", goal: "Start listening comprehension exercises" },
  { week: "Week 5–6", goal: "Practice conversations & speaking drills" },
  { week: "Week 7–8", goal: "Review, test & advance toward next level" },
];

export default function AiPlanPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "reveal">("loading");
  const [profile] = useState(() => readOnboardingData());
  const [revealed, setRevealed] = useState(false);
  // Beta stability fix: the save could fail (session hiccup, network blip)
  // while the reveal screen celebrated success regardless — the learner
  // would then click "Done" and get silently bounced back to /welcome by
  // the dashboard's onboarding_completed guard, with zero explanation for
  // what looked like a fully successful flow. saveFailed lets "Done" retry
  // instead of navigating into that confusing dead end.
  const [saveFailed, setSaveFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const persistProfile = useCallback(async (): Promise<boolean> => {
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;
      const { error } = await supabase
        .from("profiles")
        .update({
          username: profile.displayName || undefined,
          english_level: profile.level || null,
          goal: profile.goal || null,
          daily_time_minutes: profile.dailyTime,
          interests: profile.interests,
          onboarding_completed: true,
        })
        .eq("user_id", user.id);
      return !error;
    } catch {
      return false;
    }
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const saved = await persistProfile();
      // Only clear the local backup once it's actually persisted. If there
      // was no session or the write failed, keeping it means the learner's
      // answers survive to be saved on a later visit instead of being lost
      // silently (the old behavior cleared unconditionally here).
      if (saved) clearOnboardingData();
      setSaveFailed(!saved);
      setPhase("reveal");
      setTimeout(() => setRevealed(true), 50);
    }, 3200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDone() {
    if (!saveFailed) {
      router.push("/dashboard");
      return;
    }
    setFinishing(true);
    const saved = await persistProfile();
    setFinishing(false);
    if (saved) {
      clearOnboardingData();
      setSaveFailed(false);
      router.push("/dashboard");
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 py-12 text-center">
        <div className="w-full max-w-xl">
          {/* "thinking", not "typing-laptop" — that pose's file (pointing.png)
              renders with a broken transparency/checkerboard artifact against
              the mix-blend-mode frame every other pose uses cleanly
              (docs/ux-launch-audit.md P0). */}
          <Tuto pose="thinking" size="md" animation="floatSm" priority className="mx-auto mb-8" />
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 font-heading text-h1 font-bold text-text-primary"
          >
            Creating your plan
          </motion.h2>
          <p className="mb-8 text-body text-text-secondary">Analyzing your profile...</p>

          <div className="mx-auto max-w-xs space-y-3 text-left">
            {LOADING_CHECKLIST.map((item) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: item.delay }}
                className="flex items-center gap-3"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: item.delay + 0.1, type: "spring", stiffness: 300 }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-success"
                >
                  <Check className="h-3.5 w-3.5 text-text-on-primary" />
                </motion.div>
                <span className="text-small font-medium text-text-primary">{item.label}</span>
              </motion.div>
            ))}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.9 }}
              className="border-t border-border pt-3 text-small text-text-tertiary"
            >
              Creating your personalized roadmap...
            </motion.p>
          </div>
        </div>
      </div>
    );
  }

  const level = profile.level || "A1";
  const nextLevel = NEXT_LEVEL[level] || "B1";
  const vocabTarget = VOCAB_TARGET[level] || 1000;
  const weeklyHours = profile.dailyTime ? Math.round((profile.dailyTime * 5) / 60) : 2;

  const stats = [
    {
      icon: Target,
      iconClassName: "bg-primary-lighter text-primary",
      value: `${profile.dailyTime || 20} min`,
      label: "Daily Goal",
    },
    {
      icon: CalendarDays,
      iconClassName: "bg-blue-50 text-blue-500",
      value: `${weeklyHours} hrs / week`,
      label: "Weekly Target",
    },
    {
      icon: TrendingUp,
      iconClassName: "bg-success-soft text-success",
      value: `Reach ${nextLevel}`,
      label: "Estimated Progress",
      subtext: "in ~8 weeks",
    },
    {
      icon: BookOpen,
      iconClassName: "bg-purple-50 text-purple-500",
      value: `${vocabTarget.toLocaleString()} words`,
      label: "Vocabulary Target",
    },
  ];

  return (
    <div className="min-h-dvh bg-gradient-to-b from-white to-bg-muted px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <Tuto pose="celebrating" size="md" animation="float" priority className="mx-auto mb-5" />
          <p className="mb-2 text-small font-semibold uppercase tracking-wide text-primary">Your Personalized Plan</p>
          <h1 className="mb-2 font-heading text-display font-extrabold text-text-primary">
            {profile.displayName || "Your"}&apos;s Learning Roadmap
          </h1>
          <p className="text-text-secondary">
            {level} → {nextLevel} · Focused on {profile.goal || "General English"}
          </p>
        </motion.div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          {stats.map((stat, index) => (
            <StatTile key={stat.label} {...stat} delay={revealed ? index * 0.1 + 0.2 : 0} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          className="mb-6 rounded-card border border-border bg-bg-card p-6 shadow-soft"
        >
          <h3 className="mb-5 font-heading font-bold text-text-primary">Skills Schedule</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {SKILLS_SCHEDULE.map((skill) => (
              <div key={skill.name} className="flex items-center gap-3 rounded-lg bg-bg-muted p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-lighter">
                  <skill.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-small font-medium text-text-primary">{skill.name}</p>
                  <p className="text-caption text-text-tertiary">{skill.schedule}</p>
                </div>
                <Check className="ml-auto h-4 w-4 shrink-0 text-success" />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8 }}
          className="mb-8 rounded-card border border-border bg-bg-card p-6 shadow-soft"
        >
          <h3 className="mb-5 font-heading font-bold text-text-primary">Your 8-Week Roadmap</h3>
          <Timeline items={ROADMAP} baseDelay={revealed ? 1 : 0} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={revealed ? { opacity: 1 } : {}}
          transition={{ delay: 1.6 }}
          className="text-center"
        >
          <Button
            variant="primary"
            className="h-14 rounded-full px-10 text-body"
            loading={finishing}
            onClick={handleDone}
          >
            Done
          </Button>
          {saveFailed && !finishing ? (
            <p className="mt-4 text-caption text-danger">
              We couldn&apos;t save your profile — check your connection and tap Done to try again.
            </p>
          ) : (
            <p className="mt-4 text-caption text-text-tertiary">Your plan is ready</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
