"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Clock, Lightbulb, Sparkles, CheckCircle2 } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { TutoInsightsResponse } from "@/ai/services/tuto-insights";

type LoadState = "loading" | "ready" | "error";

export function TutoInsightsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<TutoInsightsResponse | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/ai/tuto-insights", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        return;
      }
      setData(json as TutoInsightsResponse);
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
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">Tuto&apos;s Insights</h1>
          <p className="text-sm text-text-secondary">Qualitative feedback on your journey</p>
        </div>
      </motion.div>

      {/* Overall assessment — neutral card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-6 flex items-start gap-4 rounded-[2rem] border border-border bg-bg-muted p-6"
      >
        <Tuto pose="neutral" size="xs" animation="none" className="mt-1" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">Overall Assessment</p>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {state === "loading"
              ? "Reflecting on your progress…"
              : state === "error"
                ? "I couldn't put together your assessment right now — try refreshing in a moment."
                : data?.assessment}
          </p>
        </div>
      </motion.div>

      {state === "error" && (
        <div className="mt-4">
          <button type="button" onClick={() => void load()} className="text-xs font-semibold text-primary hover:underline">
            Try again
          </button>
        </div>
      )}

      {/* Strengths — green */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="mt-6">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">What You&apos;re Doing Well</h2>
        </div>
        <div className="space-y-3">
          {state === "loading" ? (
            [0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl border border-border bg-bg-card" />)
          ) : state === "error" || !data ? (
            <p className="rounded-2xl border border-border bg-bg-card p-4 text-sm text-text-secondary">Not available right now.</p>
          ) : (
            data.strengths.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl border border-success/20 bg-success/10 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-text-secondary">{item}</p>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Growth areas — amber */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mt-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">Areas to Grow</h2>
        </div>
        <div className="space-y-3">
          {state === "loading" ? (
            [0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl border border-border bg-bg-card" />)
          ) : state === "error" || !data ? (
            <p className="rounded-2xl border border-border bg-bg-card p-4 text-sm text-text-secondary">Not available right now.</p>
          ) : (
            data.growthAreas.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-text-secondary">{item}</p>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Next focus — numbered */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }} className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">What to Focus On Next</h2>
        </div>
        <div className="space-y-3">
          {state === "loading" ? (
            [0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-bg-card" />)
          ) : state === "error" || !data ? (
            <p className="rounded-2xl border border-border bg-bg-card p-4 text-sm text-text-secondary">Not available right now.</p>
          ) : (
            data.nextFocus.map((item, i) => (
              <div key={i} className="flex items-start gap-4 rounded-2xl border border-border bg-bg-card p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-lighter">
                  <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <p className="pt-1 text-sm leading-relaxed text-text-secondary">{item}</p>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Cross-link back to Coaching */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-6">
        <Link
          href="/tuto-coaching"
          className="flex items-center justify-between rounded-2xl border border-border bg-bg-card p-4 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-lighter">
              <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">Get Study Tips</p>
              <p className="text-xs text-text-tertiary">Personalized coaching strategies from Tuto</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
        </Link>
      </motion.div>
    </div>
  );
}
