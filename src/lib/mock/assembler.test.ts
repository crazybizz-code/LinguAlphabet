/**
 * Assembler tests use a mock Supabase client — no real DB, no network calls.
 * The key invariant: assembleMock NEVER includes questions where approved=false.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CefrLevel } from "@/types/content";

// ── Mock Supabase service client ──────────────────────────────────────────────

// 10 reading + 8 listening so ensurePool is never triggered
// (READING_QUESTION_COUNT=10, LISTENING_QUESTION_COUNT=8)
const APPROVED_QUESTIONS = [
  { id: "r-b1-1", skill: "reading", difficulty: "B1", approved: true, deprecated: false },
  { id: "r-b1-2", skill: "reading", difficulty: "B1", approved: true, deprecated: false },
  { id: "r-b1-3", skill: "reading", difficulty: "B1", approved: true, deprecated: false },
  { id: "r-b1-4", skill: "reading", difficulty: "B1", approved: true, deprecated: false },
  { id: "r-b2-1", skill: "reading", difficulty: "B2", approved: true, deprecated: false },
  { id: "r-b2-2", skill: "reading", difficulty: "B2", approved: true, deprecated: false },
  { id: "r-b2-3", skill: "reading", difficulty: "B2", approved: true, deprecated: false },
  { id: "r-b2-4", skill: "reading", difficulty: "B2", approved: true, deprecated: false },
  { id: "r-c1-1", skill: "reading", difficulty: "C1", approved: true, deprecated: false },
  { id: "r-c1-2", skill: "reading", difficulty: "C1", approved: true, deprecated: false },
  { id: "l-b1-1", skill: "listening", difficulty: "B1", approved: true, deprecated: false },
  { id: "l-b1-2", skill: "listening", difficulty: "B1", approved: true, deprecated: false },
  { id: "l-b1-3", skill: "listening", difficulty: "B1", approved: true, deprecated: false },
  { id: "l-b2-1", skill: "listening", difficulty: "B2", approved: true, deprecated: false },
  { id: "l-b2-2", skill: "listening", difficulty: "B2", approved: true, deprecated: false },
  { id: "l-b2-3", skill: "listening", difficulty: "B2", approved: true, deprecated: false },
  { id: "l-c1-1", skill: "listening", difficulty: "C1", approved: true, deprecated: false },
  { id: "l-c1-2", skill: "listening", difficulty: "C1", approved: true, deprecated: false },
];

// This question must never appear in any assembled mock
const UNAPPROVED = { id: "r-bad-1", skill: "reading", difficulty: "B2", approved: false, deprecated: false };

function makeQueryBuilder(rows: typeof APPROVED_QUESTIONS) {
  const builder: Record<string, unknown> = {};
  const chain = {
    select: () => chain,
    eq: (_col: string, _val: unknown) => chain,
    in: (_col: string, _vals: unknown[]) => chain,
    gte: (_col: string, _val: unknown) => chain,
    limit: (_n: number) => chain,
    then: (resolve: (v: { data: typeof rows }) => void) => resolve({ data: rows }),
  };
  Object.assign(builder, chain);
  return chain;
}

vi.mock("@/lib/supabase/service-client", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "assessment_questions") {
        // Return only approved, non-deprecated rows
        return makeQueryBuilder(APPROVED_QUESTIONS);
      }
      if (table === "question_exposure") {
        return makeQueryBuilder([]);
      }
      return makeQueryBuilder([]);
    },
  }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

// Import after mocks are set up
const { assembleMock, READING_QUESTION_COUNT, LISTENING_QUESTION_COUNT } = await import("./assembler");

describe("assembleMock", () => {
  it("returns reading and listening question id arrays", async () => {
    const result = await assembleMock("user-123", "B2" as CefrLevel);
    expect(Array.isArray(result.readingIds)).toBe(true);
    expect(Array.isArray(result.listeningIds)).toBe(true);
  });

  it("respects READING_QUESTION_COUNT and LISTENING_QUESTION_COUNT caps", async () => {
    const result = await assembleMock("user-123", "B2" as CefrLevel);
    expect(result.readingIds.length).toBeLessThanOrEqual(READING_QUESTION_COUNT);
    expect(result.listeningIds.length).toBeLessThanOrEqual(LISTENING_QUESTION_COUNT);
  });

  it("only returns ids present in the approved question bank", async () => {
    const result = await assembleMock("user-123", "B2" as CefrLevel);
    const approvedIds = new Set(APPROVED_QUESTIONS.map((q) => q.id));
    for (const id of [...result.readingIds, ...result.listeningIds]) {
      expect(approvedIds.has(id)).toBe(true);
    }
    // Unapproved question must never appear
    expect(result.readingIds).not.toContain(UNAPPROVED.id);
  });

  it("separates reading and listening ids correctly", async () => {
    const result = await assembleMock("user-123", "B2" as CefrLevel);
    const readingIds = new Set(APPROVED_QUESTIONS.filter((q) => q.skill === "reading").map((q) => q.id));
    const listeningIds = new Set(APPROVED_QUESTIONS.filter((q) => q.skill === "listening").map((q) => q.id));
    for (const id of result.readingIds) {
      expect(readingIds.has(id)).toBe(true);
    }
    for (const id of result.listeningIds) {
      expect(listeningIds.has(id)).toBe(true);
    }
  });

  it("returns no duplicate ids within a section", async () => {
    const result = await assembleMock("user-123", "B2" as CefrLevel);
    expect(new Set(result.readingIds).size).toBe(result.readingIds.length);
    expect(new Set(result.listeningIds).size).toBe(result.listeningIds.length);
  });
});
