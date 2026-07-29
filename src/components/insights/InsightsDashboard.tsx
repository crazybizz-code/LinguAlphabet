import type { ReactNode } from "react";
import type { ProductIntelligenceKpis, KpiRate } from "@/lib/analytics/kpis";

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function KpiCard({
  label,
  value,
  caption,
  why,
}: {
  label: string;
  value: string;
  caption: string;
  why: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-2 text-3xl font-bold text-text-primary">{value}</p>
      <p className="mt-1 text-xs font-medium text-text-secondary">{caption}</p>
      <p className="mt-3 text-xs leading-relaxed text-text-tertiary">{why}</p>
    </div>
  );
}

function rateCaption(r: KpiRate, unit: string): string {
  return r.denominator > 0 ? `${r.numerator} / ${r.denominator} ${unit}` : `No ${unit} recorded yet`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 text-sm font-bold text-text-primary">{title}</h2>
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">{children}</div>
    </section>
  );
}

export function InsightsDashboard({ kpis }: { kpis: ProductIntelligenceKpis }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Product Intelligence</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">LinguABC — Measurement Dashboard</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-secondary">
          Every number below is computed from {kpis.eventCount.toLocaleString()} recorded events over the trailing{" "}
          {kpis.windowDays} days. See src/lib/analytics/events.ts for what each event captures and why, and
          src/lib/analytics/kpis.ts for exactly how each rate below is derived.
        </p>
      </header>

      <Section title="Engagement">
        <KpiCard
          label="Daily Active Users"
          value={kpis.dau.toLocaleString()}
          caption="distinct users today"
          why="Any recorded event counts as active — not just a lesson completion. A learner reading Progress or chatting with Tuto without finishing a lesson is still using the product."
        />
        <KpiCard
          label="Weekly Active Users"
          value={kpis.wau.toLocaleString()}
          caption="distinct users, trailing 7 days"
          why="Same activity definition as DAU, widened to a week — the standard stickiness pair (DAU/WAU ratio) is this number divided by the one to its left."
        />
        <KpiCard
          label="Average Session Length"
          value={kpis.averageSessionMinutes !== null ? `${kpis.averageSessionMinutes.toFixed(1)} min` : "—"}
          caption={kpis.sessionSampleSize > 0 ? `from ${kpis.sessionSampleSize} recorded sessions` : "No sessions recorded yet"}
          why="Measured directly (session_started -> session_ended), not estimated from lesson duration — the only true time-on-app number in this dashboard."
        />
      </Section>

      <Section title="Retention">
        <KpiCard
          label="D1 Retention"
          value={formatPercent(kpis.d1Retention.rate)}
          caption={rateCaption(kpis.d1Retention, "signups returned next day")}
          why="Cohorted by signup_completed's calendar day; 'returned' means any activity at all the following day. Only cohorts old enough to have a fully-elapsed window are counted."
        />
        <KpiCard
          label="D7 Retention"
          value={formatPercent(kpis.d7Retention.rate)}
          caption={rateCaption(kpis.d7Retention, "signups returned on day 7")}
          why="Same cohort methodology as D1, seven days out — the number that actually separates 'tried it once' from 'building a habit.'"
        />
      </Section>

      <Section title="Core Learning Loop">
        <KpiCard
          label="Lesson Completion"
          value={formatPercent(kpis.lessonCompletion.rate)}
          caption={rateCaption(kpis.lessonCompletion, "lessons finished")}
          why="lesson_completed over lesson_started, every Learning Session regardless of mission status — the broadest 'does the core product work' number."
        />
        <KpiCard
          label="Mission Completion"
          value={formatPercent(kpis.missionCompletion.rate)}
          caption={rateCaption(kpis.missionCompletion, "guided missions finished")}
          why="Same pair, filtered to today's two guided Daily Mission slots specifically — the number the streak mechanic is actually built on top of."
        />
        <KpiCard
          label="Vocabulary Review Completion"
          value={formatPercent(kpis.vocabularyReviewCompletion.rate)}
          caption={rateCaption(kpis.vocabularyReviewCompletion, "reviews finished")}
          why="Whether the spaced-repetition Word Review flow (/review) actually gets finished once opened, not just clicked into."
        />
      </Section>

      <Section title="Habit & Re-engagement">
        <KpiCard
          label="Streak Recovery Rate"
          value={formatPercent(kpis.streakRecoveryRate.rate)}
          caption={rateCaption(kpis.streakRecoveryRate, "broken or shielded streaks recovered")}
          why="Of streaks that reset (or were about to), the share that came back to a real streak (>=3) within 14 days, or never broke at all thanks to a banked Streak Shield."
        />
        <KpiCard
          label="Push Notification CTR"
          value={formatPercent(kpis.pushNotificationCtr.rate)}
          caption={rateCaption(kpis.pushNotificationCtr, "sent notifications clicked")}
          why="notification_clicked over notification_sent — the only channel that reaches a learner who hasn't opened the app; this is whether it's actually working."
        />
      </Section>

      <Section title="Monetization">
        <div className="rounded-2xl border border-dashed border-border bg-bg-muted p-5 sm:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Premium Conversion</p>
          <p className="mt-2 text-lg font-bold text-text-primary">Not applicable</p>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-text-tertiary">{kpis.premiumConversion.reason}</p>
        </div>
      </Section>
    </div>
  );
}
