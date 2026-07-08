"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ChevronRight, Clock, LogOut, Settings, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tuto } from "@/components/mascot/Tuto";
import { Button } from "@/components/ui/Button";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievements/catalog";
import { updateLearningProfile, signOutAction } from "@/lib/profile/actions";
import { DAILY_TIME_ICON, DAILY_TIME_OPTIONS, GOAL_OPTIONS, INTEREST_OPTIONS, LEVEL_LABELS, LEVEL_OPTIONS } from "@/lib/profile/options";
import { EditSheet } from "./EditSheet";

export interface ProfileViewProps {
  displayName: string;
  email: string;
  englishLevel: string | null;
  goal: string | null;
  dailyTimeMinutes: number;
  interests: string[];
  earnedAchievementIds: Set<string>;
}

type EditingField = "level" | "goal" | "dailyTime" | "interests" | null;

export function ProfileView({
  displayName,
  email,
  englishLevel,
  goal,
  dailyTimeMinutes,
  interests,
  earnedAchievementIds,
}: ProfileViewProps) {
  const [isPending, startTransition] = useTransition();
  const [editingField, setEditingField] = useState<EditingField>(null);

  // Mirrored locally so a save reflects instantly, same optimistic pattern
  // as the Learning Session's completion flow — the server action still
  // persists + revalidates Home/Explore/Progress for their next load.
  const [level, setLevel] = useState(englishLevel);
  const [currentGoal, setCurrentGoal] = useState(goal);
  const [dailyTime, setDailyTime] = useState(dailyTimeMinutes);
  const [currentInterests, setCurrentInterests] = useState(interests);
  const [pendingInterests, setPendingInterests] = useState(interests);

  const DailyTimeIcon = DAILY_TIME_ICON;

  function saveLevel(nextLevel: string) {
    setLevel(nextLevel);
    setEditingField(null);
    startTransition(async () => {
      // Non-fatal if the write fails (session hiccup, network blip) — the
      // optimistic value shown here just won't survive the next full reload,
      // it must never crash the screen the way an unhandled rejection would.
      await updateLearningProfile({ englishLevel: nextLevel }).catch(() => {});
    });
  }

  function saveGoal(nextGoal: string) {
    setCurrentGoal(nextGoal);
    setEditingField(null);
    startTransition(async () => {
      await updateLearningProfile({ goal: nextGoal }).catch(() => {});
    });
  }

  function saveDailyTime(nextValue: number) {
    setDailyTime(nextValue);
    setEditingField(null);
    startTransition(async () => {
      await updateLearningProfile({ dailyTimeMinutes: nextValue }).catch(() => {});
    });
  }

  function toggleInterest(id: string) {
    setPendingInterests((current) => (current.includes(id) ? current.filter((i) => i !== id) : [...current, id]));
  }

  function saveInterests() {
    setCurrentInterests(pendingInterests);
    setEditingField(null);
    startTransition(async () => {
      await updateLearningProfile({ interests: pendingInterests }).catch(() => {});
    });
  }

  function openInterests() {
    setPendingInterests(currentInterests);
    setEditingField("interests");
  }

  const dailyTimeLabel = DAILY_TIME_OPTIONS.find((option) => option.value === dailyTime)?.label ?? `${dailyTime} min`;
  const interestsSummary =
    currentInterests.length > 0 ? currentInterests.join(", ") : "Add topics you enjoy";

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

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-6 flex flex-col items-center text-center"
      >
        <Tuto pose="wave" size="md" animation="float" priority />
        <h2 className="mt-3 text-xl font-bold text-text-primary">{displayName}</h2>
        <p className="mt-0.5 text-sm text-text-tertiary">{email}</p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="mt-8"
      >
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Learning Profile</h3>
        <div className="flex flex-col gap-3">
          <ProfileStatRow
            icon={<span className="text-sm font-bold">{level ?? "—"}</span>}
            label="English Level"
            value={level ? `${level} — ${LEVEL_LABELS[level] ?? ""}` : "Not set"}
            onClick={() => setEditingField("level")}
          />
          <ProfileStatRow
            icon={<Target className="h-5 w-5" aria-hidden="true" />}
            label="Learning Goal"
            value={currentGoal ?? "Not set"}
            onClick={() => setEditingField("goal")}
          />
          <ProfileStatRow
            icon={<DailyTimeIcon className="h-5 w-5" aria-hidden="true" />}
            label="Daily Goal"
            value={`${dailyTimeLabel} / day`}
            onClick={() => setEditingField("dailyTime")}
          />
          <ProfileStatRow
            icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
            label="Interests"
            value={interestsSummary}
            onClick={openInterests}
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8"
      >
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Achievements</h3>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {ACHIEVEMENT_CATALOG.map((achievement, index) => {
            const unlocked = earnedAchievementIds.has(achievement.id);
            return (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 + index * 0.05 }}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-4 transition-all",
                  unlocked ? "border-border bg-bg-card" : "border-border/60 bg-bg-muted/50 opacity-60",
                )}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-2xl",
                    unlocked ? "bg-primary-lighter" : "bg-bg-muted",
                  )}
                >
                  <span className="text-xl" aria-hidden="true">
                    {achievement.icon}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-primary">{achievement.title}</p>
                  <p className="text-xs text-text-tertiary">{achievement.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8"
      >
        <Button
          variant="secondary"
          block
          disabled={isPending}
          onClick={() => startTransition(() => signOutAction())}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign Out
        </Button>
      </motion.section>

      <EditSheet open={editingField === "level"} title="English Level" onClose={() => setEditingField(null)}>
        <div className="grid grid-cols-2 gap-3">
          {LEVEL_OPTIONS.map((option) => {
            const selected = level === option.id;
            return (
              <SelectableCard key={option.id} selected={selected} onClick={() => saveLevel(option.id)} className="flex items-center gap-3 px-4 py-3.5">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-heading text-xs font-bold",
                    selected ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-secondary",
                  )}
                >
                  {option.id}
                </div>
                <span className="text-sm font-medium text-text-primary">{option.title}</span>
                {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </SelectableCard>
            );
          })}
        </div>
      </EditSheet>

      <EditSheet open={editingField === "goal"} title="Learning Goal" onClose={() => setEditingField(null)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GOAL_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = currentGoal === option.id;
            return (
              <SelectableCard key={option.id} selected={selected} onClick={() => saveGoal(option.id)} className="flex flex-col items-center gap-2.5 px-4 py-5">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-md", selected ? "bg-primary-lighter text-primary" : "bg-bg-muted text-text-tertiary")}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="text-center text-xs font-medium leading-tight text-text-secondary">{option.id}</span>
              </SelectableCard>
            );
          })}
        </div>
      </EditSheet>

      <EditSheet open={editingField === "dailyTime"} title="Daily Goal" onClose={() => setEditingField(null)}>
        <div className="flex flex-col gap-3">
          {DAILY_TIME_OPTIONS.map((option) => {
            const selected = dailyTime === option.value;
            return (
              <SelectableCard key={option.value} selected={selected} onClick={() => saveDailyTime(option.value)} className="flex w-full items-center gap-4 px-5 py-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-tertiary")}>
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-text-primary">{option.label}</p>
                  <p className="text-xs text-text-tertiary">{option.desc}</p>
                </div>
                {selected && <Check className="ml-auto h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              </SelectableCard>
            );
          })}
        </div>
      </EditSheet>

      <EditSheet open={editingField === "interests"} title="Interests" onClose={() => setEditingField(null)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {INTEREST_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = pendingInterests.includes(option.id);
            return (
              <SelectableCard key={option.id} selected={selected} onClick={() => toggleInterest(option.id)} className="flex items-center gap-2.5 px-4 py-3.5">
                <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-text-tertiary")} aria-hidden="true" />
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

function ProfileStatRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-border bg-bg-card p-4 text-left transition-colors hover:bg-bg-muted"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-tertiary">{label}</p>
        <p className="truncate text-sm font-bold text-text-primary">{value}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden="true" />
    </button>
  );
}
