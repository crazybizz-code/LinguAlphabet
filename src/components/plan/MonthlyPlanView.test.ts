import { describe, it, expect } from "vitest";
import { firstIncompleteHref, type PlanTask } from "./MonthlyPlanView";

/**
 * Regression coverage for the real Dashboard/plan-page inconsistency this
 * fix addresses: HomeView.tsx's firstIncompleteLink() already falls back
 * to "/practice" for an incomplete Article task with no content_item_id
 * yet (the Learning Brain assigns one lazily -- see content-selector.ts),
 * but MonthlyPlanView.tsx's firstIncompleteHref() had no equivalent
 * fallback and silently skipped straight to the next task instead,
 * producing a "Start Today's Tasks" destination that doesn't match the
 * first task shown in the list. Podcast is included alongside Article
 * since both share the same content-assignment gap and the fix applies
 * identically to both.
 */

function task(overrides: Partial<PlanTask>): PlanTask {
  return {
    id: "task-1",
    taskType: "article",
    title: "Read Today's Article",
    estimatedMinutes: 15,
    skillFocus: "reading",
    completed: false,
    contentItemId: null,
    ...overrides,
  };
}

describe("firstIncompleteHref", () => {
  it("1. routes an incomplete Article WITH content_item_id to the existing article route", () => {
    const href = firstIncompleteHref([task({ taskType: "article", contentItemId: "abc-123" })]);
    expect(href).toBe("/article/abc-123/learn");
  });

  it("2. routes an incomplete Podcast WITH content_item_id to the existing podcast route", () => {
    const href = firstIncompleteHref([task({ taskType: "podcast", contentItemId: "xyz-789" })]);
    expect(href).toBe("/podcast/xyz-789/learn");
  });

  it("3. routes an incomplete Article WITHOUT content_item_id to the fallback, instead of silently skipping it", () => {
    const href = firstIncompleteHref([
      task({ id: "t-article", taskType: "article", contentItemId: null }),
      task({ id: "t-vocab", taskType: "vocabulary", contentItemId: null }),
    ]);
    expect(href).toBe("/practice");
  });

  it("4. routes an incomplete Podcast WITHOUT content_item_id to the fallback, instead of silently skipping it", () => {
    const href = firstIncompleteHref([
      task({ id: "t-podcast", taskType: "podcast", contentItemId: null }),
      task({ id: "t-vocab", taskType: "vocabulary", contentItemId: null }),
    ]);
    expect(href).toBe("/practice");
  });

  it("also covers reading_practice/listening_practice WITHOUT content_item_id -- same ARTICLE_TASK_TYPES/PODCAST_TASK_TYPES sets as article/podcast", () => {
    expect(firstIncompleteHref([task({ taskType: "reading_practice", contentItemId: null })])).toBe("/practice");
    expect(firstIncompleteHref([task({ taskType: "listening_practice", contentItemId: null })])).toBe("/practice");
  });

  it("5. still skips a completed task and moves on to the next incomplete one", () => {
    const href = firstIncompleteHref([
      task({ id: "t-article", taskType: "article", contentItemId: "abc-123", completed: true }),
      task({ id: "t-podcast", taskType: "podcast", contentItemId: "xyz-789", completed: false }),
    ]);
    // The completed article is skipped entirely; the next incomplete task
    // (podcast, with content assigned) resolves normally -- proves
    // completion skipping and the new fallback compose correctly.
    expect(href).toBe("/podcast/xyz-789/learn");
  });

  it("does not change existing mock/practice task-type routing", () => {
    expect(firstIncompleteHref([task({ taskType: "mock" })])).toBe("/mock");
    expect(firstIncompleteHref([task({ taskType: "practice" })])).toBe("/practice");
  });

  it("returns the same /practice fallback when every task is already completed (unchanged end-of-loop behavior)", () => {
    const href = firstIncompleteHref([task({ taskType: "article", contentItemId: "abc-123", completed: true })]);
    expect(href).toBe("/practice");
  });
});
