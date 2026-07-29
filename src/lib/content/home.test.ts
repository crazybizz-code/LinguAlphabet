import { describe, it, expect, vi } from "vitest";
import { buildLastWeekSummary } from "./home";

const catalog = [
  { id: "a", estimatedTimeMinutes: 10 },
  { id: "b", estimatedTimeMinutes: 20 },
  { id: "c", estimatedTimeMinutes: 5 },
];

function row(id: string, updatedAt: string, completed = true) {
  return { content_item_id: id, updated_at: updatedAt, completed } as never;
}

describe("buildLastWeekSummary", () => {
  it("returns null when there's nothing completed last week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-14T12:00:00.000Z")); // a Wednesday
    expect(buildLastWeekSummary(catalog, [])).toBeNull();
    vi.useRealTimers();
  });

  it("sums only completions from the previous calendar week (Mon-Sun), excluding this week and older weeks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-14T12:00:00.000Z")); // Wed, Jan 14 2026 — this week starts Mon Jan 12
    const rows = [
      row("a", "2026-01-06T09:00:00.000Z"), // last week (Tue Jan 6)
      row("b", "2026-01-08T09:00:00.000Z"), // last week (Thu Jan 8)
      row("c", "2026-01-13T09:00:00.000Z"), // this week already (Tue Jan 13) — must be excluded
    ];
    const summary = buildLastWeekSummary(catalog, rows);
    expect(summary).toEqual({ completedCount: 2, totalMinutes: 30 });
    vi.useRealTimers();
  });

  it("ignores incomplete rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-14T12:00:00.000Z"));
    const rows = [row("a", "2026-01-06T09:00:00.000Z", false)];
    expect(buildLastWeekSummary(catalog, rows)).toBeNull();
    vi.useRealTimers();
  });
});
