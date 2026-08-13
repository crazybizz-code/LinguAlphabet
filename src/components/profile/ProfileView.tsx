"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Flame,
  Headphones,
  KeyRound,
  LogOut,
  Mail,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { AchievementsGrid } from "@/components/achievements/AchievementsGrid";
import { ProfileIdentityCard } from "./ProfileIdentityCard";
import { updateLearningProfile, signOutAction } from "@/lib/profile/actions";
import { bandToCefr } from "@/lib/onboarding/types";
import { describeExamCountdown } from "@/lib/dashboard/exam-snapshot";
import {
  CURRENT_BAND_OPTIONS,
  DAILY_TIME_OPTIONS,
  INTEREST_OPTIONS,
  TIMELINE_OPTIONS,
  formatBand,
  selectableTargetBands,
} from "@/lib/profile/options";
import { EditSheet } from "./EditSheet";

export interface ProfileViewProps {
  displayName: string;
  email: string;
  currentBand: number | null;
  /** Real placement-assessed band — deliberately separate from currentBand (self-reported). Null until a real placement is completed; never falls back to currentBand. */
  assessedBand: number | null;
  targetBand: number | null;
  examTimeline: string | null;
  examDate: string | null;
  dailyTimeMinutes: number;
  interests: string[];
  earnedAchievementIds: Set<string>;
  streak: number;
  mocksCompleted: number;
  totalReadingCorrect: number;
  totalListeningCorrect: number;
  totalReadingQuestions: number;
  totalListeningQuestions: number;
}

type EditingField = "currentBand" | "targetBand" | "examTimeline" | "dailyTime" | "interests" | null;

export function ProfileView({
  displayName,
  email,
  currentBand,
  assessedBand,
  targetBand,
  examTimeline,
  examDate,
  dailyTimeMinutes,
  interests,
  earnedAchievementIds,
  streak,
  mocksCompleted,
  totalReadingCorrect,
  totalListeningCorrect,
  totalReadingQuestions,
  totalListeningQuestions,
}: ProfileViewProps) {
  const [isPending, startTransition] = useTransition();
  const [editingField, setEditingField] = useState<EditingField>(null);

  const [band, setBand] = useState(currentBand);
  const [target, setTarget] = useState(targetBand);
  const [timeline, setTimeline] = useState(examTimeline);
  const [bookedDate, setBookedDate] = useState(examDate);
  const [dailyTime, setDailyTime] = useState(dailyTimeMinutes);
  const [currentInterests, setCurrentInterests] = useState(interests);
  const [pendingInterests, setPendingInterests] = useState(interests);

  function persist(update: Parameters<typeof updateLearningProfile>[0]) {
    setEditingField(null);
    startTransition(async () => {
      await updateLearningProfile(update).catch(() => {});
    });
  }

  function saveCurrentBand(next: number | null) { setBand(next); persist({ currentBand: next }); }
  function saveTargetBand(next: number) { setTarget(next); persist({ targetBand: next }); }
  function saveTimeline(next: string) { setTimeline(next); persist({ examTimeline: next }); }
  function saveExamDate(next: string) { setBookedDate(next || null); persist({ examDate: next || null }); }
  function saveDailyTime(next: number) { setDailyTime(next); persist({ dailyTimeMinutes: next }); }
  function toggleInterest(id: string) {
    setPendingInterests((current) => current.includes(id) ? current.filter((i) => i !== id) : [...current, id]);
  }
  function saveInterests() { setCurrentInterests(pendingInterests); persist({ interests: pendingInterests }); }
  function openInterests() { setPendingInterests(currentInterests); setEditingField("interests"); }

  const countdown = describeExamCountdown({ examDate: bookedDate, examTimeline: timeline });
  const dailyTimeLabel = DAILY_TIME_OPTIONS.find((o) => o.value === dailyTime)?.label ?? `${dailyTime} min`;
  const selectableTargets = selectableTargetBands(band);
  const hasNoMockData = mocksCompleted === 0;

  const examDateFormatted = bookedDate
    ? new Date(bookedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">

      {/* ── Identity card ── */}
      <ProfileIdentityCard displayName={displayName} email={email} currentBand={band} />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="mt-3 flex justify-end"
      >
        <button
          onClick={() => setEditingField("currentBand")}
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-muted"
        >
          Edit Profile
        </button>
      </motion.div>

      {/* ── 4-stat strip ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mt-6 grid grid-cols-4 gap-2"
      >
        {[
          { icon: Trophy, label: "Current Band", value: band !== null ? band.toFixed(1) : "—" },
          { icon: Target, label: "Target Band", value: target !== null ? target.toFixed(1) : "—" },
          { icon: Calendar, label: "Exam Date", value: examDateFormatted ?? countdown.value },
          { icon: Flame, label: "Streak", value: `${streak} days` },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-bg-card p-3 text-center shadow-sm"
          >
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-base font-bold text-text-primary leading-tight">{value}</p>
            <p className="text-[10px] text-text-secondary leading-tight">{label}</p>
          </div>
        ))}
      </motion.section>

      {/* ── IELTS Journey ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mt-8"
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">IELTS Journey</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              icon: Trophy,
              label: "Current Band",
              value: band !== null ? band.toFixed(1) : "Not set",
              sub: band !== null ? bandToCefr(band) ?? "" : "Take placement",
              onClick: () => setEditingField("currentBand"),
            },
            {
              icon: Target,
              label: "Target Band",
              value: target !== null ? target.toFixed(1) : "Not set",
              sub: target !== null ? bandToCefr(target) ?? "" : "Set a goal",
              onClick: () => setEditingField("targetBand"),
            },
            {
              icon: BookOpen,
              label: "Estimated AI Band",
              value: assessedBand !== null ? assessedBand.toFixed(1) : "—",
              sub: assessedBand !== null ? "LinguABC estimate" : "Take placement",
              onClick: undefined,
            },
            {
              icon: Calendar,
              label: "Days Until Exam",
              value: countdown.value,
              sub: countdown.label,
              onClick: () => setEditingField("examTimeline"),
            },
          ].map(({ icon: Icon, label, value, sub, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              disabled={!onClick}
              className={cn(
                "flex flex-col gap-2 rounded-2xl border border-border bg-bg-card p-4 text-left shadow-sm",
                onClick ? "transition-colors hover:bg-bg-muted" : "cursor-default",
              )}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-lighter">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-text-secondary">{label}</p>
                <p className="text-2xl font-bold text-text-primary">{value}</p>
                {sub && <p className="text-[10px] text-text-tertiary">{sub}</p>}
              </div>
            </button>
          ))}
        </div>
      </motion.section>

      {/* ── Study Statistics ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16 }}
        className="mt-8"
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Study Statistics</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              icon: Clock,
              label: "Study Time",
              value: hasNoMockData ? null : `${mocksCompleted * 55} min`,
              sub: hasNoMockData ? "Complete your first mock to unlock insights." : "estimated",
            },
            {
              icon: BookOpen,
              label: "Mock Tests Completed",
              value: hasNoMockData ? null : String(mocksCompleted),
              sub: hasNoMockData ? "Complete your first mock to unlock insights." : "total attempts",
            },
            {
              icon: BookOpen,
              label: "Reading Questions Solved",
              value: hasNoMockData ? null : String(totalReadingCorrect),
              sub: hasNoMockData ? "Complete your first mock to unlock insights." : `of ${totalReadingQuestions} attempted`,
            },
            {
              icon: Headphones,
              label: "Listening Questions Solved",
              value: hasNoMockData ? null : String(totalListeningCorrect),
              sub: hasNoMockData ? "Complete your first mock to unlock insights." : `of ${totalListeningQuestions} attempted`,
            },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-card p-4 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bg-muted">
                <Icon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-text-secondary">{label}</p>
                {value !== null ? (
                  <p className="mt-0.5 text-2xl font-bold text-text-primary">{value}</p>
                ) : (
                  <p className="mt-0.5 text-sm font-semibold text-text-tertiary">No data yet</p>
                )}
                <p className="mt-0.5 text-[10px] text-text-tertiary">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Achievements ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8"
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Achievements</h2>
        <AchievementsGrid earnedAchievementIds={earnedAchievementIds} baseDelay={0.25} />
      </motion.section>

      {/* ── Learning Preferences ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24 }}
        className="mt-8"
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Learning Preferences</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              icon: Clock,
              label: "Daily Study Time",
              value: dailyTimeLabel,
              onClick: () => setEditingField("dailyTime"),
            },
            {
              icon: Target,
              label: "Target Band",
              value: target !== null ? `Band ${target.toFixed(1)}` : "Not set",
              onClick: () => setEditingField("targetBand"),
            },
            {
              icon: Calendar,
              label: "Exam Date",
              value: examDateFormatted ?? countdown.value,
              onClick: () => setEditingField("examTimeline"),
            },
            {
              icon: Bell,
              label: "Daily Reminder",
              value: "Set in device",
              onClick: undefined,
            },
          ].map(({ icon: Icon, label, value, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              disabled={!onClick}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-bg-card px-4 py-3.5 text-left shadow-sm",
                onClick ? "transition-colors hover:bg-bg-muted" : "cursor-default",
              )}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-text-secondary">{label}</p>
                <p className="text-sm font-semibold text-text-primary truncate">{value}</p>
              </div>
              {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </motion.section>

      {/* ── Account ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.28 }}
        className="mt-8"
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Account</h2>
        <div className="flex flex-col divide-y divide-border/40 rounded-2xl border border-border bg-bg-card shadow-sm overflow-hidden">
          {[
            { icon: Mail, label: "Email", value: email, href: undefined },
            { icon: KeyRound, label: "Change Password", value: null, href: "/settings/password" },
            { icon: Bell, label: "Notifications", value: null, href: "/settings/notifications" },
          ].map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <span className="flex-1 text-sm font-semibold text-text-primary">{label}</span>
              {value && <span className="text-xs text-text-tertiary truncate max-w-[140px]">{value}</span>}
              {href && (
                <Link href={href} className="text-text-tertiary hover:text-text-primary">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
              {!href && <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden="true" />}
            </div>
          ))}

          {/* Log out */}
          <button
            onClick={() => startTransition(() => signOutAction())}
            disabled={isPending}
            className="flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg-muted"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter">
              <LogOut className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <span className="flex-1 text-sm font-semibold text-text-primary">Log Out</span>
            <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          </button>
        </div>
      </motion.section>

      {/* ── Danger Zone ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.32 }}
        className="mt-6 mb-10"
      >
        <h2 className="mb-3 text-sm font-semibold text-red-500">Danger Zone</h2>
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 dark:border-red-800/40 dark:bg-red-900/10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-800/30">
              <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Delete Account</p>
              <p className="text-xs text-text-secondary">Permanently remove your account and data</p>
            </div>
          </div>
          <button
            disabled
            title="Contact support to delete your account"
            className="rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white opacity-60 cursor-not-allowed"
          >
            Delete
          </button>
        </div>
      </motion.section>

      {/* ── Edit Sheets ── */}
      <EditSheet open={editingField === "currentBand"} title="Current Band" onClose={() => setEditingField(null)}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {CURRENT_BAND_OPTIONS.map((option) => (
            <BandOption key={option} label={formatBand(option)} selected={band === option} onClick={() => saveCurrentBand(option)} />
          ))}
          <BandOption label="Not sure" selected={band === null} onClick={() => saveCurrentBand(null)} className="col-span-3 sm:col-span-4" />
        </div>
      </EditSheet>

      <EditSheet open={editingField === "targetBand"} title="Target Band" onClose={() => setEditingField(null)}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {selectableTargets.map((option) => (
            <BandOption key={option} label={formatBand(option)} selected={target === option} onClick={() => saveTargetBand(option)} />
          ))}
        </div>
        {band !== null && (
          <p className="mt-4 text-center text-xs text-text-secondary">
            Showing bands at or above your current band of {formatBand(band)}.
          </p>
        )}
      </EditSheet>

      <EditSheet open={editingField === "examTimeline"} title="Exam Date" onClose={() => setEditingField(null)}>
        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-semibold text-text-primary">Booked your exam?</span>
          <input
            type="date"
            value={bookedDate ?? ""}
            onChange={(event) => saveExamDate(event.target.value)}
            className="w-full rounded-lg border-2 border-border bg-bg-card px-4 py-3 text-sm font-medium text-text-primary transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-soft"
          />
          <span className="mt-2 block text-xs text-text-secondary">
            {bookedDate ? "Clear the date to go back to a rough timeline." : "Leave empty if you haven't booked yet."}
          </span>
        </label>
        <p className="mb-3 text-sm font-semibold text-text-primary">Or choose a rough timeline</p>
        <div className="flex flex-col gap-3">
          {TIMELINE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = timeline === option.id;
            return (
              <SelectableCard key={option.id} selected={selected} onClick={() => saveTimeline(option.id)} className="flex w-full items-center gap-4 px-5 py-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-secondary")}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-text-primary">{option.id}</p>
                  <p className="text-xs text-text-secondary">{option.desc}</p>
                </div>
                {selected && <Check className="ml-auto h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              </SelectableCard>
            );
          })}
        </div>
      </EditSheet>

      <EditSheet open={editingField === "dailyTime"} title="Daily Study Time" onClose={() => setEditingField(null)}>
        <div className="flex flex-col gap-3">
          {DAILY_TIME_OPTIONS.map((option) => {
            const selected = dailyTime === option.value;
            return (
              <SelectableCard key={option.value} selected={selected} onClick={() => saveDailyTime(option.value)} className="flex w-full items-center gap-4 px-5 py-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-secondary")}>
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-text-primary">{option.label}</p>
                  <p className="text-xs text-text-secondary">{option.desc}</p>
                </div>
                {selected && <Check className="ml-auto h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              </SelectableCard>
            );
          })}
        </div>
      </EditSheet>

      <EditSheet open={editingField === "interests"} title="Topics of Interest" onClose={() => setEditingField(null)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {INTEREST_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = pendingInterests.includes(option.id);
            return (
              <SelectableCard key={option.id} selected={selected} onClick={() => toggleInterest(option.id)} className="flex items-center gap-2.5 px-4 py-3.5">
                <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-text-secondary")} aria-hidden="true" />
                <span className={cn("text-sm font-medium", selected ? "text-primary-dark" : "text-text-secondary")}>{option.id}</span>
                {selected && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
              </SelectableCard>
            );
          })}
        </div>
        <Button variant="primary" block className="mt-5" onClick={saveInterests} disabled={pendingInterests.length === 0}>
          Save
        </Button>
      </EditSheet>
    </div>
  );
}

function BandOption({
  label,
  selected,
  onClick,
  className,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      className={cn("flex items-center justify-center px-3 py-3.5 text-sm font-bold", selected ? "text-primary-dark" : "text-text-primary", className)}
    >
      {label}
    </SelectableCard>
  );
}
