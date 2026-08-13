import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Real, DB-backed evidence for Tuto Coaching/Insights — deliberately NOT a
 * full Repository wired into AIDependencies (src/ai/data/dependencies.ts):
 * generateStructuredJson (src/ai/services/generate-structured-json.ts) is
 * the "headless" primitive that skips that whole learner-machinery layer on
 * purpose (see its own doc comment), so gathering evidence for it belongs
 * here as a plain query function, not a second repository abstraction for
 * a single batch-style call site.
 *
 * Every field is present only when a real row backs it. No field is ever
 * synthesized, defaulted to a plausible-looking number, or copied from one
 * concept to stand in for another (e.g. onboarding self-report standing in
 * for an assessed level) — see docs/... the Progress screen's own
 * assessed_cefr_level vs english_level distinction, which this mirrors.
 */
export interface RecentPracticeEvidence {
  skill: "reading" | "listening";
  scorePct: number;
  date: string;
}

export interface LatestMockEvidence {
  band: number | null;
  readingPct: number | null;
  listeningPct: number | null;
  cefrLevel: string | null;
  submittedAt: string;
}

export interface LearnerEvidence {
  displayName: string;
  /** Real placement-assessed level, never the onboarding self-report field. Null until placement is completed. */
  assessedCefrLevel: string | null;
  assessedBand: number | null;
  targetBand: number | null;
  /** Free-form, user-authored — the AI module doesn't own a canonical goal list. */
  learningGoal: string | null;
  streak: number;
  /** Deduped, most-recent-first, from real learning_signals evidence (practice_completed/mock_completed) — same source Progress reads. */
  weakAreas: string[];
  /** Real practice_sessions rows, most recent first. */
  recentPractice: RecentPracticeEvidence[];
  latestMock: LatestMockEvidence | null;
  mocksCompletedCount: number;
  /** True once there is at least one real signal beyond a bare profile row — lets a caller decide whether there's enough to say anything specific. */
  hasMeaningfulHistory: boolean;
}

type SignalEvidenceShape = { weakAreas?: string[] };

export async function gatherLearnerEvidence(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LearnerEvidence> {
  const [
    { data: profile },
    { data: weakAreaSignals },
    { data: practiceSessions },
    { data: mockAttempts },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, assessed_cefr_level, assessed_band, target_band, goal, streak")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("learning_signals")
      .select("evidence")
      .eq("user_id", userId)
      .in("type", ["practice_completed", "mock_completed"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("practice_sessions")
      .select("practice_type, score_pct, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(5),
    supabase
      .from("full_mock_attempts")
      .select("estimated_band, reading_score_pct, listening_score_pct, result_cefr_level, submitted_at")
      .eq("user_id", userId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1),
  ]);

  const allWeakAreas = (weakAreaSignals ?? []).flatMap((signal) => {
    const evidence = signal.evidence as SignalEvidenceShape | null;
    return evidence?.weakAreas ?? [];
  });
  const weakAreas = [...new Set(allWeakAreas)].slice(0, 5);

  const recentPractice: RecentPracticeEvidence[] = (practiceSessions ?? [])
    .filter((session) => session.completed_at !== null && session.score_pct !== null)
    .map((session) => ({
      skill: session.practice_type === "listening" ? "listening" : "reading",
      scorePct: session.score_pct as number,
      date: session.completed_at as string,
    }));

  const latestAttempt = (mockAttempts ?? [])[0] ?? null;
  const latestMock: LatestMockEvidence | null = latestAttempt
    ? {
        band: latestAttempt.estimated_band,
        readingPct: latestAttempt.reading_score_pct,
        listeningPct: latestAttempt.listening_score_pct,
        cefrLevel: latestAttempt.result_cefr_level,
        submittedAt: latestAttempt.submitted_at as string,
      }
    : null;

  // A full attempt count (not just the latest row) needs its own lightweight query —
  // head:true avoids pulling every row just to count them.
  const { count: mocksCompletedCount } = await supabase
    .from("full_mock_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "submitted");

  return {
    displayName: profile?.username || "there",
    assessedCefrLevel: profile?.assessed_cefr_level ?? null,
    assessedBand: profile?.assessed_band ?? null,
    targetBand: profile?.target_band ?? null,
    learningGoal: profile?.goal ?? null,
    streak: profile?.streak ?? 0,
    weakAreas,
    recentPractice,
    latestMock,
    mocksCompletedCount: mocksCompletedCount ?? 0,
    hasMeaningfulHistory: weakAreas.length > 0 || recentPractice.length > 0 || latestMock !== null,
  };
}

/**
 * Renders evidence as a plain-text bullet block for a prompt — every line
 * is a real, sourced fact; nothing here is prose the model invented. A
 * field absent from the DB is a line absent from this block (never "N/A"
 * or a placeholder), so the model is never handed something that looks
 * like a value but isn't one.
 */
export function formatLearnerEvidence(evidence: LearnerEvidence): string {
  const lines: string[] = [`- Name: ${evidence.displayName}`];

  if (evidence.assessedCefrLevel) lines.push(`- Assessed English level (from placement test): ${evidence.assessedCefrLevel}`);
  if (evidence.assessedBand !== null) lines.push(`- Assessed band estimate: ${evidence.assessedBand.toFixed(1)}`);
  if (evidence.targetBand !== null) lines.push(`- Target band goal: ${evidence.targetBand.toFixed(1)}`);
  if (evidence.learningGoal) lines.push(`- Stated learning goal: ${evidence.learningGoal}`);
  if (evidence.streak > 0) lines.push(`- Current study streak: ${evidence.streak} day${evidence.streak === 1 ? "" : "s"}`);
  if (evidence.weakAreas.length > 0) lines.push(`- Recently flagged weak areas: ${evidence.weakAreas.join(", ")}`);

  if (evidence.recentPractice.length > 0) {
    const items = evidence.recentPractice
      .map((p) => `${p.skill} practice scored ${Math.round(p.scorePct)}% on ${p.date.slice(0, 10)}`)
      .join("; ");
    lines.push(`- Recent practice sessions: ${items}`);
  }

  if (evidence.latestMock) {
    const m = evidence.latestMock;
    const parts = [
      m.band !== null ? `overall band ${m.band.toFixed(1)}` : null,
      m.readingPct !== null ? `reading ${Math.round(m.readingPct)}%` : null,
      m.listeningPct !== null ? `listening ${Math.round(m.listeningPct)}%` : null,
      m.cefrLevel ? `result level ${m.cefrLevel}` : null,
    ].filter(Boolean);
    lines.push(`- Most recent full mock exam (${m.submittedAt.slice(0, 10)}): ${parts.join(", ")}`);
  }
  if (evidence.mocksCompletedCount > 0) {
    lines.push(`- Total full mock exams completed: ${evidence.mocksCompletedCount}`);
  }

  if (lines.length === 1) {
    lines.push("- No practice sessions, mock exams, or placement results recorded yet.");
  }

  return lines.join("\n");
}
