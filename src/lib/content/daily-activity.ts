import type { Database } from "@/types/supabase";
import type { PodcastContent } from "@/types/content";

type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type VocabularyRow = Database["public"]["Tables"]["vocabulary"]["Row"];

export interface DailyCompletedItem {
  contentId: string;
  title: string;
  thumbnailUrl: string;
  minutes: number;
  xpEarned: number;
  quizScore: number | null;
  quizTotal: number | null;
  flashcardsCompleted: number;
}

export interface DailyVocabularyWord {
  word: string;
  definition: string | null;
}

export interface DailyReflection {
  contentTitle: string | null;
  content: string;
}

export interface DailyActivity {
  hasActivity: boolean;
  totalMinutes: number;
  totalXp: number;
  completedItems: DailyCompletedItem[];
  vocabularyLearned: DailyVocabularyWord[];
  reflections: DailyReflection[];
}

export const EMPTY_DAILY_ACTIVITY: DailyActivity = {
  hasActivity: false,
  totalMinutes: 0,
  totalXp: 0,
  completedItems: [],
  vocabularyLearned: [],
  reflections: [],
};

/** Local Y-M-D key — must match buildMonthActivity's own day bucketing
 * (src/lib/content/progress.ts) so a calendar cell and its Daily Activity
 * panel can never disagree about what "that day" means. */
export function dailyActivityDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * One entry per calendar day that had any real recorded activity — built
 * once, server-side, from the same rows the month grid's intensity coloring
 * uses (progress, plus vocabulary and notes for the words/reflections a
 * completion alone doesn't capture). "Flashcards completed" isn't tracked
 * as its own row: reaching a completed progress row means the learner went
 * through every step including Flashcards, so it's real (not fabricated)
 * to report it as that podcast's vocabulary count.
 */
export function buildDailyActivityIndex(params: {
  progressRows: ProgressRow[];
  podcasts: PodcastContent[];
  vocabularyRows: VocabularyRow[];
  noteRows: NoteRow[];
}): Record<string, DailyActivity> {
  const { progressRows, podcasts, vocabularyRows, noteRows } = params;
  const podcastById = new Map(podcasts.map((podcast) => [podcast.id, podcast]));
  const index = new Map<string, DailyActivity>();

  function getOrCreate(key: string): DailyActivity {
    let entry = index.get(key);
    if (!entry) {
      entry = { hasActivity: false, totalMinutes: 0, totalXp: 0, completedItems: [], vocabularyLearned: [], reflections: [] };
      index.set(key, entry);
    }
    return entry;
  }

  for (const row of progressRows) {
    if (!row.completed) continue;
    const podcast = podcastById.get(row.content_item_id);
    if (!podcast) continue;

    const entry = getOrCreate(dailyActivityDateKey(new Date(row.updated_at)));
    entry.hasActivity = true;
    entry.totalMinutes += podcast.estimatedTimeMinutes;
    entry.totalXp += row.xp_earned;
    entry.completedItems.push({
      contentId: podcast.id,
      title: podcast.title,
      thumbnailUrl: podcast.thumbnailUrl,
      minutes: podcast.estimatedTimeMinutes,
      xpEarned: row.xp_earned,
      quizScore: row.quiz_score,
      quizTotal: row.quiz_total,
      flashcardsCompleted: podcast.vocabulary.length,
    });
  }

  for (const row of vocabularyRows) {
    const entry = getOrCreate(dailyActivityDateKey(new Date(row.created_at)));
    entry.hasActivity = true;
    entry.vocabularyLearned.push({ word: row.word, definition: row.definition });
  }

  for (const row of noteRows) {
    const entry = getOrCreate(dailyActivityDateKey(new Date(row.created_at)));
    entry.hasActivity = true;
    entry.reflections.push({ contentTitle: row.content_item_title, content: row.content });
  }

  return Object.fromEntries(index);
}

export function getDailyActivity(index: Record<string, DailyActivity>, date: Date): DailyActivity {
  return index[dailyActivityDateKey(date)] ?? EMPTY_DAILY_ACTIVITY;
}
