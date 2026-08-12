"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ResumeStrip } from "@/lib/dashboard/resume";

export function ContinueLearningCard({ resume }: { resume: ResumeStrip }) {
  const pct = resume.percentage ?? 0;
  const circumference = 2 * Math.PI * 20;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="mt-5 px-5 sm:px-8"
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Continue Learning</h2>
      <Link
        href={resume.href}
        className="group flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
      >
        {/* Circular progress ring */}
        <div className="relative h-14 w-14 shrink-0">
          <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
            <circle
              cx="24" cy="24" r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-slate-100"
            />
            <circle
              cx="24" cy="24" r="20"
              fill="none"
              stroke="#FF6B00"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-text-primary">
            {Math.round(pct)}%
          </span>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Continue Learning
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-text-primary">{resume.title}</p>
          {resume.minutesLeft !== null && (
            <p className="mt-0.5 text-xs text-text-secondary">{resume.minutesLeft} min left</p>
          )}
        </div>

        {/* Resume button */}
        <span className="shrink-0 rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white transition-opacity group-hover:opacity-90">
          Resume
        </span>
      </Link>
    </motion.section>
  );
}
