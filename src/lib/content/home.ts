import type { Database } from "@/types/supabase";
import type { PodcastContent } from "@/types/content";

type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];

export interface ResumeItem {
  podcast: PodcastContent;
  positionSeconds: number;
}

export interface HomeData {
  todaysMission: PodcastContent | null;
  resumeItem: ResumeItem | null;
  recommendations: PodcastContent[];
  weeklyMinutes: number;
}

/** Computed server-side (in the page) so the client component never has to
 * recompute it against the browser's clock and risk a hydration mismatch. */
export function getTimeGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

/**
 * Assembles everything Home needs from already-fetched podcasts + this
 * user's progress rows. The "Today's Mission" pick is a temporary
 * placeholder for the Learning Brain (docs/content-lifecycle.md §3 — not
 * built yet): level match first, else featured, else the first eligible
 * item. Swap this function's body for the real recommendation service
 * later; callers (the Home page) don't need to change.
 */
export function buildHomeData(
  podcasts: PodcastContent[],
  progressRows: ProgressRow[],
  englishLevel: string | null,
): HomeData {
  const byId = new Map(podcasts.map((podcast) => [podcast.id, podcast]));

  const mostRecentInProgress = [...progressRows]
    .filter((row) => !row.completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

  const resumePodcast = mostRecentInProgress ? byId.get(mostRecentInProgress.content_item_id) : undefined;
  const resumeItem: ResumeItem | null = resumePodcast
    ? { podcast: resumePodcast, positionSeconds: mostRecentInProgress.position_seconds }
    : null;

  const completedIds = new Set(progressRows.filter((row) => row.completed).map((row) => row.content_item_id));

  const eligible = podcasts.filter((podcast) => podcast.id !== resumeItem?.podcast.id && !completedIds.has(podcast.id));

  const todaysMission =
    eligible.find((podcast) => podcast.cefrLevelMin === englishLevel) ??
    eligible.find((podcast) => podcast.featured) ??
    eligible[0] ??
    null;

  const recommendations = eligible.filter((podcast) => podcast.id !== todaysMission?.id).slice(0, 3);

  const weekStart = startOfWeek(new Date());
  const weeklyMinutes = progressRows
    .filter((row) => row.completed && new Date(row.updated_at) >= weekStart)
    .reduce((sum, row) => sum + (byId.get(row.content_item_id)?.estimatedTimeMinutes ?? 0), 0);

  return { todaysMission, resumeItem, recommendations, weeklyMinutes };
}
