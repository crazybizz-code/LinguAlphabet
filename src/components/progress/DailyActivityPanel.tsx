"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, CheckCircle2, Clock, Flame, MessageSquareText, Zap } from "lucide-react";
import { EditSheet } from "@/components/profile/EditSheet";
import { Tuto } from "@/components/mascot/Tuto";
import type { DailyActivity } from "@/lib/content/daily-activity";

export interface DailyActivityPanelProps {
  open: boolean;
  date: Date | null;
  activity: DailyActivity;
  streak: number;
  longestStreak: number;
  onClose: () => void;
}

function formatDateTitle(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** Same-day comparison in local time — matches the calendar grid's own bucketing. */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildEmptyDayMessage(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) {
    return "No study session yet today — there's still time. Ready to start one?";
  }
  if (date.getTime() > today.getTime()) {
    return "This day hasn't happened yet — but it's a great one to plan for!";
  }
  return "Looks like a rest day. Even breaks are part of learning — let's pick it back up today!";
}

/**
 * The Learning Calendar's Daily Activity panel — a real journal entry for
 * one day, built entirely from buildDailyActivityIndex (progress + vocabulary
 * + notes rows), never fabricated. Reuses EditSheet (the same bottom-sheet/
 * modal chrome as DictionaryOverlay and the Profile field editors) so the
 * calendar's new interactivity still reads as the same product.
 */
export function DailyActivityPanel({ open, date, activity, streak, longestStreak, onClose }: DailyActivityPanelProps) {
  if (!date) return null;

  return (
    <EditSheet open={open} title={formatDateTitle(date)} onClose={onClose}>
      {!activity.hasActivity ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Tuto pose="happy" size="md" />
          <p className="text-sm leading-relaxed text-text-secondary">{buildEmptyDayMessage(date)}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-bg-muted p-4">
              <div className="mb-1 flex items-center gap-1.5 text-text-tertiary">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide">Study Time</span>
              </div>
              <p className="text-xl font-bold text-text-primary">{Math.round(activity.totalMinutes)} min</p>
            </div>
            <div className="rounded-2xl border border-border bg-bg-muted p-4">
              <div className="mb-1 flex items-center gap-1.5 text-text-tertiary">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide">XP Earned</span>
              </div>
              <p className="text-xl font-bold text-text-primary">+{activity.totalXp}</p>
            </div>
          </div>

          {activity.completedItems.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-text-primary">Completed Mission{activity.completedItems.length > 1 ? "s" : ""}</h3>
              </div>
              <div className="flex flex-col gap-2">
                {activity.completedItems.map((item) => (
                  <Link
                    key={item.contentId}
                    href={`/podcast/${item.contentId}/learn`}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-bg-muted">
                      {item.thumbnailUrl && (
                        <Image src={item.thumbnailUrl} alt="" fill sizes="48px" className="object-cover" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-text-primary">{item.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-tertiary">
                        <span>{Math.round(item.minutes)} min</span>
                        <span>+{item.xpEarned} XP</span>
                        {item.quizTotal !== null && (
                          <span>
                            Quiz: {item.quizScore}/{item.quizTotal}
                          </span>
                        )}
                        <span>{item.flashcardsCompleted} flashcards</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {activity.vocabularyLearned.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-text-primary">Vocabulary Learned</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {activity.vocabularyLearned.map((entry, index) => (
                  <span
                    key={`${entry.word}-${index}`}
                    className="rounded-full border border-border bg-bg-card px-3 py-1.5 text-xs font-semibold text-text-secondary"
                  >
                    {entry.word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activity.reflections.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-text-primary">Reflection</h3>
              </div>
              <div className="flex flex-col gap-2">
                {activity.reflections.map((reflection, index) => (
                  <div key={index} className="rounded-2xl border border-border bg-bg-muted p-4">
                    {reflection.contentTitle && (
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        {reflection.contentTitle}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed text-text-secondary">{reflection.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-2xl border border-primary-light bg-primary-lighter p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-card">
              <Flame className="h-4 w-4 text-primary" aria-hidden="true" />
            </span>
            <p className="text-sm leading-relaxed text-text-secondary">
              <span className="font-bold text-text-primary">{streak}-day</span> current streak
              {longestStreak > streak ? ` · longest streak ${longestStreak} days` : " · your longest yet!"}
            </p>
          </div>
        </div>
      )}
    </EditSheet>
  );
}
