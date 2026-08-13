"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Brain, ChevronRight, Clock, Lightbulb, Mic, BookOpen } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { TutoCoachingResponse } from "@/ai/services/tuto-coaching";

/**
 * Base44 reference: generic educational strategies, not learner data — kept
 * as static content on purpose (approved scope: "Keep the static Study
 * Strategies content from Base44 because those are generic educational
 * strategies, not fake learner data").
 */
const STUDY_STRATEGIES = [
  { icon: Clock, title: "Spaced Repetition", desc: "Review vocabulary at increasing intervals to lock it into long-term memory." },
  { icon: Brain, title: "Active Recall", desc: "Close the transcript and try to summarize what you heard in your own words." },
  { icon: Mic, title: "Shadow Speaking", desc: "Listen to a sentence, then repeat it aloud mimicking the rhythm and intonation." },
  { icon: BookOpen, title: "Context Learning", desc: "Learn words in full sentences, not isolation — your brain remembers stories better." },
];

type LoadState = "loading" | "ready" | "error";

export function TutoCoachingView() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<TutoCoachingResponse | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/ai/tuto-coaching", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        return;
      }
      setData(json as TutoCoachingResponse);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    // Deferred to a microtask so `load`'s own synchronous setState("loading")
    // never runs directly inside the effect body (react-hooks/set-state-in-effect)
    // — mirrors the .then()-deferred pattern useTutoChat.ts already uses for
    // its own mount-time fetch.
    void Promise.resolve().then(() => load());
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center gap-3">
        <Tuto pose="neutral" size="avatar" animation="float" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">Tuto Coaching</h1>
          <p className="text-sm text-text-secondary">Personalized tips just for you</p>
        </div>
      </motion.div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-6 rounded-[2rem] bg-gradient-to-br from-primary to-[#FF8C33] p-6 shadow-[0_20px_50px_-12px_rgba(255,107,0,0.35)] sm:p-8"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Lightbulb className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70">Your Coach Says</p>
            <p className="mt-2 text-sm leading-relaxed text-white/90">
              {state === "loading"
                ? "Analyzing your progress to craft the perfect study plan…"
                : state === "error"
                  ? "I couldn't put together a personalized note right now — but the strategies below are a great place to keep building momentum."
                  : data?.encouragement}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Personalized tips — real, AI-generated from this learner's own evidence */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">Personalized Tips for You</h2>
        </div>
        <div className="space-y-3">
          {state === "loading" ? (
            [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-bg-card" />)
          ) : state === "error" || !data ? (
            <div className="rounded-2xl border border-border bg-bg-card p-4">
              <p className="text-sm text-text-secondary">Personalized tips aren&apos;t available right now.</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-xs font-semibold text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            data.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-4 rounded-2xl border border-border bg-bg-card p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-lighter">
                  <span className="text-sm font-bold text-primary">{i + 1}</span>
                </div>
                <div className="pt-1">
                  {tip.title && <p className="text-sm font-semibold text-text-primary">{tip.title}</p>}
                  <p className="text-sm leading-relaxed text-text-secondary">{tip.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Study Strategies — static, generic, not learner-specific */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">Study Strategies</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {STUDY_STRATEGIES.map((strategy) => (
            <div key={strategy.title} className="rounded-2xl border border-border bg-bg-muted p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-card">
                <strategy.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-bold text-text-primary">{strategy.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-tertiary">{strategy.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Cross-link to Insights */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }} className="mt-6">
        <Link
          href="/tutos-insights"
          className="flex items-center justify-between rounded-2xl border border-border bg-bg-card p-4 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-lighter">
              <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">Tuto&apos;s Insights</p>
              <p className="text-xs text-text-tertiary">See qualitative feedback on your progress</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
        </Link>
      </motion.div>
    </div>
  );
}
