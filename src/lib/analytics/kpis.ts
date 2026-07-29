import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { ANALYTICS_EVENT_NAMES, type AnalyticsEventName } from "./events";

const WINDOW_DAYS = 90;
const D1_RECOVERY_WINDOW_DAYS = 14;

export interface RawEvent {
  user_id: string;
  event_name: AnalyticsEventName;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface ProductIntelligenceKpis {
  windowDays: number;
  eventCount: number;
  dau: number;
  wau: number;
  d1Retention: KpiRate;
  d7Retention: KpiRate;
  lessonCompletion: KpiRate;
  missionCompletion: KpiRate;
  vocabularyReviewCompletion: KpiRate;
  averageSessionMinutes: number | null;
  sessionSampleSize: number;
  streakRecoveryRate: KpiRate;
  pushNotificationCtr: KpiRate;
  premiumConversion: { status: "not_applicable"; reason: string };
}

export interface KpiRate {
  numerator: number;
  denominator: number;
  rate: number | null;
}

function rate(numerator: number, denominator: number): KpiRate {
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null };
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Pure computation — every KPI in the Product Intelligence brief, derived
 * from one flat list of already-fetched events plus an injected "now"
 * (so cohort-window math is deterministically testable, see kpis.test.ts,
 * rather than silently depending on the real clock). The impure wrapper
 * below (computeProductIntelligenceKpis) is the only thing that touches
 * Supabase — this function never does.
 */
export function computeKpisFromEvents(events: RawEvent[], now: Date): ProductIntelligenceKpis {
  const today = now.toISOString().slice(0, 10);

  const byName = new Map<AnalyticsEventName, RawEvent[]>();
  for (const name of ANALYTICS_EVENT_NAMES) byName.set(name, []);
  for (const event of events) {
    byName.get(event.event_name)?.push(event);
  }

  // --- DAU / WAU: any event at all counts as "active," not just a
  // completion — a learner reading Progress or opening Tuto without
  // finishing a lesson that day is still a real active user. ---
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dau = new Set(events.filter((e) => dateOnly(e.created_at) === today).map((e) => e.user_id)).size;
  const wau = new Set(events.filter((e) => new Date(e.created_at) >= sevenDaysAgo).map((e) => e.user_id)).size;

  // --- D1 / D7 retention: cohort by signup_completed's calendar day,
  // "returned" means ANY event on the target day. Only cohorts old enough
  // to have a fully-elapsed D+1/D+7 window are counted, so a just-signed-
  // up cohort never drags the rate down before it's had a chance to
  // return at all. ---
  const signups = byName.get("signup_completed") ?? [];
  const anyEventDatesByUser = new Map<string, Set<string>>();
  for (const event of events) {
    if (!anyEventDatesByUser.has(event.user_id)) anyEventDatesByUser.set(event.user_id, new Set());
    anyEventDatesByUser.get(event.user_id)!.add(dateOnly(event.created_at));
  }

  function computeCohortRetention(offsetDays: number): KpiRate {
    let numerator = 0;
    let denominator = 0;
    for (const signup of signups) {
      const cohortDate = new Date(dateOnly(signup.created_at));
      const daysSinceCohort = Math.floor((now.getTime() - cohortDate.getTime()) / (24 * 60 * 60 * 1000));
      if (daysSinceCohort < offsetDays) continue; // window hasn't elapsed yet
      denominator += 1;
      const targetDate = new Date(cohortDate);
      targetDate.setDate(targetDate.getDate() + offsetDays);
      const targetDateStr = targetDate.toISOString().slice(0, 10);
      if (anyEventDatesByUser.get(signup.user_id)?.has(targetDateStr)) numerator += 1;
    }
    return rate(numerator, denominator);
  }

  const d1Retention = computeCohortRetention(1);
  const d7Retention = computeCohortRetention(7);

  // --- Lesson / Mission completion: lesson_started -> lesson_completed,
  // same pair filtered to slotType/isMission for the mission-only cut. ---
  const lessonStarted = byName.get("lesson_started") ?? [];
  const lessonCompleted = byName.get("lesson_completed") ?? [];
  const lessonCompletion = rate(lessonCompleted.length, lessonStarted.length);
  const missionStartedCount = lessonStarted.filter((e) => e.properties.slotType === "mission").length;
  const missionCompletedCount = lessonCompleted.filter((e) => e.properties.isMission === true).length;
  const missionCompletion = rate(missionCompletedCount, missionStartedCount);

  // --- Vocabulary review completion ---
  const vocabReviewStarted = byName.get("vocabulary_review_started") ?? [];
  const vocabReviewCompleted = byName.get("vocabulary_review_completed") ?? [];
  const vocabularyReviewCompletion = rate(vocabReviewCompleted.length, vocabReviewStarted.length);

  // --- Average session length ---
  const sessionEnded = byName.get("session_ended") ?? [];
  const durations = sessionEnded
    .map((e) => (typeof e.properties.durationMs === "number" ? e.properties.durationMs : null))
    .filter((d): d is number => d !== null && d > 0);
  const averageSessionMinutes = durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length / 60000 : null;

  // --- Streak recovery rate: of streak_reset events old enough for a
  // full D1_RECOVERY_WINDOW_DAYS to have elapsed, what fraction have a
  // later lesson_completed (a real mission, streak >= 3) for the same
  // user within that window. A shield-covered day (streak_shield_used)
  // counts too — it's the cleanest possible "recovery," the streak never
  // even broke. ---
  const streakResets = byName.get("streak_reset") ?? [];
  const shieldUsed = byName.get("streak_shield_used") ?? [];
  const missionCompletionsByUser = new Map<string, RawEvent[]>();
  for (const event of lessonCompleted) {
    if (event.properties.isMission !== true) continue;
    if (!missionCompletionsByUser.has(event.user_id)) missionCompletionsByUser.set(event.user_id, []);
    missionCompletionsByUser.get(event.user_id)!.push(event);
  }
  let recoveries = 0;
  let eligibleResets = 0;
  for (const resetEvent of streakResets) {
    const daysSinceReset = daysBetween(resetEvent.created_at, now.toISOString());
    if (daysSinceReset < D1_RECOVERY_WINDOW_DAYS) continue;
    eligibleResets += 1;
    const laterCompletions = missionCompletionsByUser.get(resetEvent.user_id) ?? [];
    const recovered = laterCompletions.some((completion) => {
      const daysAfterReset = daysBetween(resetEvent.created_at, completion.created_at);
      const streakAfter = typeof completion.properties.streakAfter === "number" ? completion.properties.streakAfter : 0;
      return daysAfterReset >= 0 && daysAfterReset <= D1_RECOVERY_WINDOW_DAYS && streakAfter >= 3;
    });
    if (recovered) recoveries += 1;
  }
  // Shields "used" within the same reset-eligible population never appear
  // as a streak_reset at all (that's the entire point of a shield — see
  // streak.ts) — counted here as their own always-recovered contribution
  // so the rate reflects every path a streak survives, not only the ones
  // that broke and came back.
  const streakRecoveryRate = rate(recoveries + shieldUsed.length, eligibleResets + shieldUsed.length);

  // --- Push notification CTR ---
  const notificationSent = byName.get("notification_sent") ?? [];
  const notificationClicked = byName.get("notification_clicked") ?? [];
  const pushNotificationCtr = rate(notificationClicked.length, notificationSent.length);

  return {
    windowDays: WINDOW_DAYS,
    eventCount: events.length,
    dau,
    wau,
    d1Retention,
    d7Retention,
    lessonCompletion,
    missionCompletion,
    vocabularyReviewCompletion,
    averageSessionMinutes,
    sessionSampleSize: durations.length,
    streakRecoveryRate,
    pushNotificationCtr,
    premiumConversion: {
      status: "not_applicable",
      reason:
        "No premium tier, paywall, or billing system exists in LinguABC yet — premium_paywall_viewed/premium_upgrade_completed are defined in events.ts but have zero real call sites.",
    },
  };
}

/**
 * Fetches every analytics_events row in the trailing WINDOW_DAYS and
 * delegates to computeKpisFromEvents. One query intentionally rather than
 * eleven independent ones — at this product's real event volume a single
 * 90-day pull is trivial, and every KPI staying computed from exactly the
 * same underlying rows means they can never silently disagree about what
 * "the last 90 days" means. Uses the service-role client
 * (src/lib/supabase/service-client.ts) since this is a cross-user
 * aggregate no per-row RLS policy could ever permit for a normal signed-
 * in user — access is gated in application code instead
 * (src/app/insights/page.tsx's ADMIN_EMAILS check).
 */
export async function computeProductIntelligenceKpis(
  supabase: SupabaseClient<Database>,
): Promise<ProductIntelligenceKpis> {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const { data } = await supabase
    .from("analytics_events")
    .select("user_id, event_name, properties, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  return computeKpisFromEvents((data ?? []) as RawEvent[], new Date());
}
