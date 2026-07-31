"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { StatRow } from "@/components/ui/StatRow";
import { AchievementsGrid } from "@/components/achievements/AchievementsGrid";
import { updateLearningProfile, signOutAction } from "@/lib/profile/actions";
import { bandToCefr } from "@/lib/onboarding/types";
import {
  BAND_ICON,
  CURRENT_BAND_OPTIONS,
  DAILY_TIME_ICON,
  DAILY_TIME_OPTIONS,
  INTERESTS_ICON,
  INTEREST_OPTIONS,
  TARGET_ICON,
  TIMELINE_ICON,
  TIMELINE_OPTIONS,
  formatBand,
  selectableTargetBands,
} from "@/lib/profile/options";
import { ProfileIdentityCard } from "./ProfileIdentityCard";
import { EditSheet } from "./EditSheet";

export interface ProfileViewProps {
  displayName: string;
  email: string;
  /** Null when the learner answered "Not sure" — never defaulted. */
  currentBand: number | null;
  targetBand: number | null;
  examTimeline: string | null;
  dailyTimeMinutes: number;
  interests: string[];
  earnedAchievementIds: Set<string>;
}

type EditingField = "currentBand" | "targetBand" | "examTimeline" | "dailyTime" | "interests" | null;

/**
 * Profile, IELTS-first.
 *
 * The band replaces the CEFR level as the thing a learner edits. CEFR is
 * still written — the Learning Brain, content matching and Tuto's prompt
 * all speak it — but it is now derived from the band inside
 * updateLearningProfile rather than being a second editable field that
 * could disagree with it.
 *
 * Learning Goal is gone. The IELTS flow always writes "Exam Preparation",
 * so a picker offering General English / Travel / Work was offering to
 * contradict the product model, and it silently re-ranked their content
 * when used (goal alignment is weight 25 in the rule engine).
 */
export function ProfileView({
  displayName,
  email,
  currentBand,
  targetBand,
  examTimeline,
  dailyTimeMinutes,
  interests,
  earnedAchievementIds,
}: ProfileViewProps) {
  const [isPending, startTransition] = useTransition();
  const [editingField, setEditingField] = useState<EditingField>(null);

  // Mirrored locally so a save reflects instantly, same optimistic pattern
  // as the Learning Session's completion flow — the server action still
  // persists + revalidates Home/Explore/Progress for their next load.
  const [band, setBand] = useState(currentBand);
  const [target, setTarget] = useState(targetBand);
  const [timeline, setTimeline] = useState(examTimeline);
  const [dailyTime, setDailyTime] = useState(dailyTimeMinutes);
  const [currentInterests, setCurrentInterests] = useState(interests);
  const [pendingInterests, setPendingInterests] = useState(interests);

  /** Non-fatal if the write fails (session hiccup, network blip) — the optimistic value shown here just won't survive the next full reload, and it must never crash the screen the way an unhandled rejection would. */
  function persist(update: Parameters<typeof updateLearningProfile>[0]) {
    setEditingField(null);
    startTransition(async () => {
      await updateLearningProfile(update).catch(() => {});
    });
  }

  function saveCurrentBand(next: number | null) {
    setBand(next);
    persist({ currentBand: next });
  }

  function saveTargetBand(next: number) {
    setTarget(next);
    persist({ targetBand: next });
  }

  function saveTimeline(next: string) {
    setTimeline(next);
    persist({ examTimeline: next });
  }

  function saveDailyTime(next: number) {
    setDailyTime(next);
    persist({ dailyTimeMinutes: next });
  }

  function toggleInterest(id: string) {
    setPendingInterests((current) => (current.includes(id) ? current.filter((i) => i !== id) : [...current, id]));
  }

  function saveInterests() {
    setCurrentInterests(pendingInterests);
    persist({ interests: pendingInterests });
  }

  function openInterests() {
    setPendingInterests(currentInterests);
    setEditingField("interests");
  }

  const derivedCefr = bandToCefr(band);
  const dailyTimeLabel = DAILY_TIME_OPTIONS.find((option) => option.value === dailyTime)?.label ?? `${dailyTime} min`;
  const interestsSummary = currentInterests.length > 0 ? currentInterests.join(", ") : "Add topics you enjoy";

  const selectableTargets = selectableTargetBands(band);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Profile</h1>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-card transition-colors hover:bg-bg-muted"
        >
          <Settings className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        </Link>
      </motion.header>

      <ProfileIdentityCard displayName={displayName} email={email} currentBand={band} />

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="mt-8"
        aria-labelledby="ielts-journey-heading"
      >
        <h2 id="ielts-journey-heading" className="mb-3 text-sm font-semibold text-text-primary">
          IELTS Journey
        </h2>
        <div className="flex flex-col gap-3">
          <StatRow
            icon={<BAND_ICON className="h-5 w-5" aria-hidden="true" />}
            label="Current Band"
            value={band === null ? "Not set — take your placement test" : formatBand(band)}
            onClick={() => setEditingField("currentBand")}
          />
          <StatRow
            icon={<TARGET_ICON className="h-5 w-5" aria-hidden="true" />}
            label="Target Band"
            value={target === null ? "Not set" : formatBand(target)}
            onClick={() => setEditingField("targetBand")}
          />
          <StatRow
            icon={<TIMELINE_ICON className="h-5 w-5" aria-hidden="true" />}
            label="Exam Timeline"
            value={timeline || "Not set"}
            onClick={() => setEditingField("examTimeline")}
          />
        </div>
        {/* Shown, not hidden, and explicitly labelled as derived. The rest
            of the product still speaks CEFR — content ranges, the Learning
            Brain, Tuto's prompt — so a learner who sees "B2" elsewhere
            should be able to find out here where it came from. Read-only:
            editing it independently is exactly the drift this redesign
            removes. */}
        <p className="mt-3 px-1 text-xs text-text-secondary">
          {derivedCefr
            ? `Your reading and listening level is set to ${derivedCefr}, calculated from your band.`
            : "Your reading and listening level is calculated from your band once you have one."}
        </p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8"
        aria-labelledby="learning-preferences-heading"
      >
        <h2 id="learning-preferences-heading" className="mb-3 text-sm font-semibold text-text-primary">
          Learning Preferences
        </h2>
        <div className="flex flex-col gap-3">
          <StatRow
            icon={<DAILY_TIME_ICON className="h-5 w-5" aria-hidden="true" />}
            label="Daily Study Time"
            value={`${dailyTimeLabel} / day`}
            onClick={() => setEditingField("dailyTime")}
          />
          <StatRow
            icon={<INTERESTS_ICON className="h-5 w-5" aria-hidden="true" />}
            label="Topics of Interest"
            value={interestsSummary}
            onClick={openInterests}
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className="mt-8"
        aria-labelledby="profile-achievements-heading"
      >
        <h2 id="profile-achievements-heading" className="mb-3 text-sm font-semibold text-text-primary">
          Achievements
        </h2>
        <AchievementsGrid earnedAchievementIds={earnedAchievementIds} baseDelay={0.3} />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8"
      >
        <Button variant="secondary" block disabled={isPending} onClick={() => startTransition(() => signOutAction())}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign Out
        </Button>
      </motion.section>

      <EditSheet open={editingField === "currentBand"} title="Current Band" onClose={() => setEditingField(null)}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {CURRENT_BAND_OPTIONS.map((option) => (
            <BandOption key={option} label={formatBand(option)} selected={band === option} onClick={() => saveCurrentBand(option)} />
          ))}
          {/* The same honest answer onboarding accepts — it writes NULL
              rather than a guessed band, and the placement assessment is
              what resolves it. */}
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

      <EditSheet open={editingField === "examTimeline"} title="Exam Timeline" onClose={() => setEditingField(null)}>
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
            const Icon = DAILY_TIME_ICON;
            return (
              <SelectableCard key={option.value} selected={selected} onClick={() => saveDailyTime(option.value)} className="flex w-full items-center gap-4 px-5 py-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-secondary")}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
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

/** Band tiles are numbers, not labelled options — the value IS the label, so they get a denser grid than the icon-and-description cards above. */
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
