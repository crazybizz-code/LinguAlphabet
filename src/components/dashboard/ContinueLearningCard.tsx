"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import type { ResumeStrip } from "@/lib/dashboard/resume";

function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ContinueLearningCard({ resume }: { resume: ResumeStrip }) {
  const pct = resume.percentage ?? 0;
  const circumference = 2 * Math.PI * 26;
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
        <div className="relative h-16 w-16 shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
            <circle
              cx="30" cy="30" r="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-slate-100"
            />
            <circle
              cx="30" cy="30" r="26"
              fill="none"
              stroke="#FF6B00"
              strokeWidth="4"
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
          <p className="text-xs font-medium text-text-secondary">Resume your session</p>
          <p className="mt-0.5 truncate text-sm font-bold text-text-primary">{resume.title}</p>
          {resume.secondsLeft !== null && (
            <p className="mt-0.5 text-xs font-semibold text-[#FF6B00]">{formatMmSs(resume.secondsLeft)} left</p>
          )}
        </div>

        {/* Resume button */}
        <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white transition-opacity group-hover:opacity-90">
          <Play className="h-3.5 w-3.5 fill-white" aria-hidden="true" />
          Resume
        </span>
      </Link>
    </motion.section>
  );
}
