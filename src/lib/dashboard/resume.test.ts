import { describe, it, expect } from "vitest";
import { buildResumeStrip } from "./resume";
import type { DailyMissionSlot } from "@/lib/learning-brain";

function podcast(id: string, durationSeconds = 1200) {
  return { id, contentType: "podcast", title: `Podcast ${id}`, durationSeconds } as never;
}

function article(id: string) {
  return { id, contentType: "article", title: `Article ${id}` } as never;
}

function slotWithMission(contentType: "article" | "podcast", contentId: string): DailyMissionSlot {
  return { contentType, mission: { contentId } as never, completedTitle: null };
}

const emptySlots: DailyMissionSlot[] = [
  { contentType: "article", mission: null, completedTitle: null },
  { contentType: "podcast", mission: null, completedTitle: null },
];

describe("buildResumeStrip", () => {
  it("returns null when nothing is in progress", () => {
    expect(buildResumeStrip({ candidate: null, missions: emptySlots })).toBeNull();
  });

  it("surfaces an unfinished lesson that today's plan has moved past", () => {
    const strip = buildResumeStrip({
      candidate: { content: podcast("orphan"), positionSeconds: 300 },
      missions: emptySlots,
    });
    expect(strip).toEqual({
      title: "Podcast orphan",
      href: "/podcast/orphan/learn",
      percentage: 25,
      minutesLeft: 15,
    });
  });

  it("suppresses the strip when the in-progress lesson IS today's mission", () => {
    // The slot row already renders it with a Resume CTA and its own
    // progress bar — showing it twice inside the same card is the
    // duplicate-CTA problem, not a feature.
    expect(
      buildResumeStrip({
        candidate: { content: podcast("today"), positionSeconds: 300 },
        missions: [slotWithMission("podcast", "today"), ...emptySlots.slice(0, 1)],
      }),
    ).toBeNull();
  });

  it("ignores a podcast that was opened but never played", () => {
    expect(
      buildResumeStrip({ candidate: { content: podcast("cold"), positionSeconds: 0 }, missions: emptySlots }),
    ).toBeNull();
  });

  it("surfaces an unfinished article, which has no position to judge by", () => {
    const strip = buildResumeStrip({
      candidate: { content: article("read-me"), positionSeconds: 0 },
      missions: emptySlots,
    });
    expect(strip).toEqual({
      title: "Article read-me",
      href: "/article/read-me/learn",
      percentage: null,
      minutesLeft: null,
    });
  });

  it("reports no percentage for a podcast with an unknown duration", () => {
    const strip = buildResumeStrip({
      candidate: { content: podcast("no-duration", 0), positionSeconds: 120 },
      missions: emptySlots,
    });
    expect(strip?.percentage).toBeNull();
    expect(strip?.minutesLeft).toBeNull();
  });

  it("never reports more than 100% or negative time left when the position overruns the duration", () => {
    const strip = buildResumeStrip({
      candidate: { content: podcast("overrun", 600), positionSeconds: 900 },
      missions: emptySlots,
    });
    expect(strip?.percentage).toBe(100);
    expect(strip?.minutesLeft).toBe(0);
  });
});
