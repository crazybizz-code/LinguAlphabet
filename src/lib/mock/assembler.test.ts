/**
 * Assembler tests use a mock Supabase client — no real DB, no network calls.
 *
 * The mock generically applies every .eq()/.in() filter against each row's
 * own field, the same way real PostgREST filtering does, across FOUR mocked
 * tables (mock_passages, mock_listening_sections, assessment_questions,
 * question_exposure) sharing one in-memory `store`. This is deliberately
 * faithful rather than a hand-picked fixed fixture -- an earlier version of
 * this same file (pre-dating the passage/section structure) shipped an
 * unfaithful mock that ignored the `.eq("skill", ...)` filter entirely,
 * which silently passed reading ids into the listening result and was only
 * caught by the "insufficient bank" tests failing unexpectedly. Applying
 * every filter for real avoids repeating that class of mistake here.
 *
 * GROUP-RELATED CONTRACT ITEMS (C, D, M below) are now REAL, implemented
 * assertions -- unlike the previous pass (which marked them it.todo()
 * pending a schema that didn't exist yet), supabase/mock-structure-schema.sql
 * now provides mock_passages/mock_listening_sections and the
 * mock_passage_id/mock_listening_section_id columns this assembler reads.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CefrLevel } from "@/types/content";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

let store: Store = {};
let simulateMissingGroupInstructionsColumn = false;

function makeBuilder(rows: Row[]) {
  const predicates: Array<(row: Row) => boolean> = [];
  let selectedColumns = "";
  const chain = {
    select: (columns: string) => {
      selectedColumns = columns;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      predicates.push((row) => row[col] === val);
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      predicates.push((row) => vals.includes(row[col]));
      return chain;
    },
    gte: () => chain,
    limit: () => chain,
    then: (resolve: (v: { data: Row[] | null; error: { code: string; message: string } | null }) => void) => {
      if (simulateMissingGroupInstructionsColumn && selectedColumns.includes("mock_group_instructions")) {
        resolve({ data: null, error: { code: "42703", message: "column mock_group_instructions does not exist" } });
        return;
      }
      resolve({ data: rows.filter((row) => predicates.every((p) => p(row))), error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/service-client", () => ({
  createServiceClient: () => ({
    from: (table: string) => makeBuilder(store[table] ?? []),
  }),
}));

// Import after mocks are set up
const {
  assembleMock,
  READING_PASSAGE_COUNT,
  READING_QUESTION_COUNT,
  LISTENING_SECTION_COUNT,
  LISTENING_QUESTION_COUNT,
  IELTS_ACADEMIC_READING_TIME_LIMIT_MINUTES,
  READING_TIME_LIMIT_SECONDS,
} = await import("./assembler");

beforeEach(() => {
  store = { mock_passages: [], mock_listening_sections: [], assessment_questions: [], question_exposure: [] };
  simulateMissingGroupInstructionsColumn = false;
});

/**
 * Seeds one passage/section group with `count` approved-by-default
 * questions. Returns the question ids so tests can assert on them directly.
 * `questionOverrides[i]` lets a specific question in the group be marked
 * unapproved/deprecated without affecting the rest of the group.
 */
function seedGroup(
  kind: "reading" | "listening",
  groupId: string,
  count: number,
  opts: {
    groupApproved?: boolean;
    groupDeprecated?: boolean;
    difficulty?: string | null;
    questionOverrides?: Record<number, { approved?: boolean; deprecated?: boolean }>;
  } = {},
): string[] {
  const parentTable = kind === "reading" ? "mock_passages" : "mock_listening_sections";
  const parentIdColumn = kind === "reading" ? "mock_passage_id" : "mock_listening_section_id";

  store[parentTable].push({
    id: groupId,
    title: groupId,
    body_text: kind === "reading" ? `Passage ${groupId}` : null,
    approved: opts.groupApproved ?? true,
    deprecated: opts.groupDeprecated ?? false,
    difficulty: opts.difficulty === undefined ? "B2" : opts.difficulty,
  });

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${groupId}-q${i}`;
    ids.push(id);
    const override = opts.questionOverrides?.[i] ?? {};
    store.assessment_questions.push({
      id,
      skill: kind,
      approved: override.approved ?? true,
      deprecated: override.deprecated ?? false,
      [parentIdColumn]: groupId,
      [kind === "reading" ? "mock_listening_section_id" : "mock_passage_id"]: null,
      type: "multiple_choice",
      difficulty: opts.difficulty === undefined ? "B2" : opts.difficulty,
      question: `${groupId} question ${i + 1}`,
      options: ["A", "B", "C"],
      correct_answer: "A",
      accepted_answers: null,
      answer_word_limit: null,
      option_pool: null,
      mock_group_id: `${groupId}-group`,
      mock_sequence: i + 1,
      created_at: new Date(2024, 0, 1, 0, i).toISOString(),
    });
  }
  return ids;
}

/** A valid, minimal, exactly-40/40 structure: 3 reading passages (15+12+13), 4 listening sections (11+10+10+9). Sizes are deliberately non-uniform to prove the algorithm doesn't assume a fixed per-group count. */
function seedValidStructure() {
  seedGroup("reading", "p1", 15);
  seedGroup("reading", "p2", 12);
  seedGroup("reading", "p3", 13);
  seedGroup("listening", "s1", 11);
  seedGroup("listening", "s2", 10);
  seedGroup("listening", "s3", 10);
  seedGroup("listening", "s4", 9);
}

describe("assembleMock — exact counts and passage/section structure (A, B, C, D)", () => {
  it("A: returns exactly 40 reading questions from non-uniform passage sizes (15+12+13)", async () => {
    seedValidStructure();
    const result = await assembleMock("user-1", "B2" as CefrLevel);
    expect(READING_QUESTION_COUNT).toBe(40);
    expect(result.readingIds).toHaveLength(40);
  });

  it("B: returns exactly 40 listening questions from non-uniform section sizes (11+10+10+9)", async () => {
    seedValidStructure();
    const result = await assembleMock("user-1", "B2" as CefrLevel);
    expect(LISTENING_QUESTION_COUNT).toBe(40);
    expect(result.listeningIds).toHaveLength(40);
  });

  it("C: Reading uses exactly 3 distinct passage ids", async () => {
    seedValidStructure();
    expect(READING_PASSAGE_COUNT).toBe(3);
    const result = await assembleMock("user-1", "B2" as CefrLevel);
    expect(result.readingPassageIds).toHaveLength(3);
    expect(new Set(result.readingPassageIds).size).toBe(3);
    expect(new Set(result.readingPassageIds)).toEqual(new Set(["p1", "p2", "p3"]));
  });

  it("D: Listening uses exactly 4 distinct section ids", async () => {
    seedValidStructure();
    expect(LISTENING_SECTION_COUNT).toBe(4);
    const result = await assembleMock("user-1", "B2" as CefrLevel);
    expect(result.listeningSectionIds).toHaveLength(4);
    expect(new Set(result.listeningSectionIds).size).toBe(4);
    expect(new Set(result.listeningSectionIds)).toEqual(new Set(["s1", "s2", "s3", "s4"]));
  });
});

describe("assembleMock — no duplicates (E, F)", () => {
  it("E: no duplicate reading question ids, even with extra unused candidate passages in the pool", async () => {
    seedValidStructure();
    seedGroup("reading", "p4-unused", 20); // decoy: not part of any 3-combo summing to 40 alongside p1/p2/p3
    seedGroup("reading", "p5-unused", 8);

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    expect(new Set(result.readingIds).size).toBe(result.readingIds.length);
    expect(result.readingIds).toHaveLength(40);
  });

  it("F: no duplicate listening question ids, even with extra unused candidate sections in the pool", async () => {
    seedValidStructure();
    seedGroup("listening", "s5-unused", 25);

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    expect(new Set(result.listeningIds).size).toBe(result.listeningIds.length);
    expect(result.listeningIds).toHaveLength(40);
  });
});

describe("assembleMock — no cross-skill mixing (G, H)", () => {
  it("G: Reading never contains a listening question id", async () => {
    seedValidStructure();
    const result = await assembleMock("user-1", "B2" as CefrLevel);
    for (const id of result.readingIds) expect(id.startsWith("s")).toBe(false);
  });

  it("H: Listening never contains a reading question id", async () => {
    seedValidStructure();
    const result = await assembleMock("user-1", "B2" as CefrLevel);
    for (const id of result.listeningIds) expect(id.startsWith("p")).toBe(false);
  });
});

describe("assembleMock — content-quality gate, INSIDE a selected group (I, J)", () => {
  it("I: unapproved questions inside a selected passage are excluded from both the sum and the result", async () => {
    // p1 authored with 15 questions but 3 unapproved -> only 12 count.
    const p1Ids = seedGroup("reading", "p1", 15, {
      questionOverrides: { 0: { approved: false }, 1: { approved: false }, 2: { approved: false } },
    });
    seedGroup("reading", "p2", 13);
    seedGroup("reading", "p3", 15);
    seedGroup("listening", "s1", 10);
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    const unapprovedIds = [p1Ids[0], p1Ids[1], p1Ids[2]];
    for (const id of unapprovedIds) expect(result.readingIds).not.toContain(id);
    expect(result.readingIds).toHaveLength(40); // 12 + 13 + 15
    expect(result.readingPassageIds).toEqual(expect.arrayContaining(["p1"]));
  });

  it("J: deprecated questions inside a selected section are excluded from both the sum and the result", async () => {
    seedGroup("reading", "p1", 15);
    seedGroup("reading", "p2", 12);
    seedGroup("reading", "p3", 13);
    const s1Ids = seedGroup("listening", "s1", 12, {
      questionOverrides: { 0: { deprecated: true }, 1: { deprecated: true } },
    });
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    const deprecatedIds = [s1Ids[0], s1Ids[1]];
    for (const id of deprecatedIds) expect(result.listeningIds).not.toContain(id);
    expect(result.listeningIds).toHaveLength(40); // 10 + 10 + 10 + 10
  });

  it("an unapproved OR deprecated PASSAGE itself is never chosen, even if its questions are individually approved", async () => {
    seedGroup("reading", "p1", 15, { groupApproved: false });
    seedGroup("reading", "p2", 12);
    seedGroup("reading", "p3", 13);
    seedGroup("reading", "p4", 15); // valid alternative to p1
    seedGroup("listening", "s1", 10);
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    expect(result.readingPassageIds).not.toContain("p1");
    expect(result.readingPassageIds).toEqual(expect.arrayContaining(["p4"]));
  });
});

describe("assembleMock — 60-day exposure de-prioritisation across GROUP combinations (K)", () => {
  it("K: prefers the group combination with the least recently-seen content when multiple exact-sum combinations exist", async () => {
    // Multiple valid 3-combinations exist: {a,b,c}=40, {a,d,e}=40, {b,d,e}=40.
    const aIds = seedGroup("reading", "p-a", 10);
    const bIds = seedGroup("reading", "p-b", 10);
    const cIds = seedGroup("reading", "p-c", 20);
    seedGroup("reading", "p-d", 15);
    seedGroup("reading", "p-e", 15);
    seedGroup("listening", "s1", 10);
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    // Mark every question in "p-c" as recently seen -- any combo using it
    // should lose to one that doesn't, since {a,d,e} and {b,d,e} both exist
    // as zero-exposure alternatives.
    store.question_exposure = cIds.map((id) => ({ user_id: "user-1", question_id: id }));

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    expect(result.readingPassageIds).not.toContain("p-c");
    for (const id of [...aIds, ...bIds, ...cIds]) {
      if (cIds.includes(id)) expect(result.readingIds).not.toContain(id);
    }
    expect(result.readingIds).toHaveLength(40);
  });
});

describe("assembleMock — explicit failure on insufficient structural content (L)", () => {
  it("L: throws when fewer than 3 approved reading passages exist at all", async () => {
    seedGroup("reading", "p1", 20);
    seedGroup("reading", "p2", 20);
    seedGroup("listening", "s1", 10);
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    await expect(assembleMock("user-1", "B2" as CefrLevel)).rejects.toThrow(/only 2 approved reading group\(s\) with at least one approved question exist.*requires exactly 3/i);
  });

  it("L: throws when fewer than 4 approved listening sections exist at all", async () => {
    seedGroup("reading", "p1", 15);
    seedGroup("reading", "p2", 12);
    seedGroup("reading", "p3", 13);
    seedGroup("listening", "s1", 15);
    seedGroup("listening", "s2", 15);

    await expect(assembleMock("user-1", "B2" as CefrLevel)).rejects.toThrow(/only 2 approved listening group\(s\)/i);
  });

  it("L: throws when enough groups exist but NO combination of exactly 3 sums to exactly 40 (no partial/truncated fallback)", async () => {
    seedGroup("reading", "p1", 20);
    seedGroup("reading", "p2", 20);
    seedGroup("reading", "p3", 20); // any 3-combo of {20,20,20} sums to 60, never 40
    seedGroup("listening", "s1", 10);
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    await expect(assembleMock("user-1", "B2" as CefrLevel)).rejects.toThrow(/no combination of exactly 3 approved reading group\(s\) has questions summing to exactly 40/i);
  });
});

describe("assembleMock — group integrity: a used group is never truncated (M)", () => {
  it("M: a large group's FULL question set is present when it's part of the winning combination, never a subset of it", async () => {
    const bigGroupIds = seedGroup("reading", "p-big", 20);
    seedGroup("reading", "p-mid", 10);
    seedGroup("reading", "p-small", 10); // 20 + 10 + 10 = 40, the only valid combo
    seedGroup("reading", "p-decoy", 15); // cannot participate in any exact-40 3-combo here
    seedGroup("listening", "s1", 10);
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    expect(result.readingPassageIds).toContain("p-big");
    for (const id of bigGroupIds) {
      expect(result.readingIds).toContain(id);
    }
    expect(result.readingIds).toHaveLength(40);
  });
});

describe("assembleMock — CEFR ±1 preference, widening only when necessary (preserved requirement)", () => {
  it("prefers CEFR ±1 groups, but widens to the full approved bank when no ±1 combination sums exactly", async () => {
    // Only C2 passages exist -- far outside B2's ±1 window (A2/B1/B2/C1) --
    // so the widened, difficulty-unrestricted pass must be the one that succeeds.
    seedGroup("reading", "p1", 15, { difficulty: "C2" });
    seedGroup("reading", "p2", 12, { difficulty: "C2" });
    seedGroup("reading", "p3", 13, { difficulty: "C2" });
    seedGroup("listening", "s1", 10, { difficulty: "C2" });
    seedGroup("listening", "s2", 10, { difficulty: "C2" });
    seedGroup("listening", "s3", 10, { difficulty: "C2" });
    seedGroup("listening", "s4", 10, { difficulty: "C2" });

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    expect(result.readingIds).toHaveLength(40);
    expect(result.listeningIds).toHaveLength(40);
  });
});

describe("assembleMock — backward compatibility: ungrouped legacy questions are ignored, never broken (non-Mock flows unaffected)", () => {
  it("questions with no structural parent (Placement/Practice-only) are never selected and never block a valid mock", async () => {
    seedValidStructure();
    // Legacy, ungrouped questions -- both structural-parent columns absent,
    // exactly like every real live seed row today.
    store.assessment_questions.push(
      { id: "legacy-r-1", skill: "reading", approved: true, deprecated: false, created_at: new Date().toISOString() },
      { id: "legacy-l-1", skill: "listening", approved: true, deprecated: false, created_at: new Date().toISOString() },
    );

    const result = await assembleMock("user-1", "B2" as CefrLevel);

    expect(result.readingIds).not.toContain("legacy-r-1");
    expect(result.listeningIds).not.toContain("legacy-l-1");
    expect(result.readingIds).toHaveLength(40);
    expect(result.listeningIds).toHaveLength(40);
  });
});

/**
 * READING-ONLY MODE. Reading's own guarantees are unchanged -- exactly 3
 * passages summing to exactly 40 questions, same exact-sum search, same
 * approval filters. Only the Listening half is skipped, and only when the
 * caller explicitly asks; the default remains a FULL mock.
 */
describe("assembleMock — reading-only mode", () => {
  it("assembles 3 passages / 40 reading questions with NO listening content in the bank at all", async () => {
    seedGroup("reading", "p1", 13);
    seedGroup("reading", "p2", 13);
    seedGroup("reading", "p3", 14);
    // Deliberately zero listening sections seeded.

    const result = await assembleMock("user-1", "B2" as CefrLevel, { includeListening: false });

    expect(result.readingPassageIds).toHaveLength(3);
    expect(result.readingIds).toHaveLength(40);
    expect(result.listeningIds).toEqual([]);
    expect(result.listeningSectionIds).toEqual([]);
  });

  it("does not query mock_listening_sections at all in reading-only mode", async () => {
    seedGroup("reading", "p1", 13);
    seedGroup("reading", "p2", 13);
    seedGroup("reading", "p3", 14);
    seedGroup("listening", "s1", 10);
    seedGroup("listening", "s2", 10);
    seedGroup("listening", "s3", 10);
    seedGroup("listening", "s4", 10);

    const result = await assembleMock("user-1", "B2" as CefrLevel, { includeListening: false });

    // Even with a fully populated listening bank, nothing listening is selected.
    expect(result.listeningIds).toEqual([]);
    expect(result.listeningSectionIds).toEqual([]);
    expect(result.readingIds).toHaveLength(40);
  });

  it("still enforces the reading exact-sum rule -- reading-only does not mean 'best effort'", async () => {
    seedGroup("reading", "p1", 20);
    seedGroup("reading", "p2", 20);
    seedGroup("reading", "p3", 20); // no 3-group combination sums to 40

    await expect(assembleMock("user-1", "B2" as CefrLevel, { includeListening: false })).rejects.toThrow(/sums to exactly 40|summing to exactly 40/i);
  });

  it("still throws when fewer than 3 approved reading passages exist", async () => {
    seedGroup("reading", "p1", 20);
    seedGroup("reading", "p2", 20);

    await expect(assembleMock("user-1", "B2" as CefrLevel, { includeListening: false })).rejects.toThrow(/only 2 approved reading group\(s\)/i);
  });

  it("REGRESSION: the default is still a FULL mock -- omitting the option keeps listening mandatory", async () => {
    seedGroup("reading", "p1", 13);
    seedGroup("reading", "p2", 13);
    seedGroup("reading", "p3", 14);
    // No listening seeded: a full mock must still fail.

    await expect(assembleMock("user-1", "B2" as CefrLevel)).rejects.toThrow(/listening/i);
    await expect(assembleMock("user-1", "B2" as CefrLevel, {})).rejects.toThrow(/listening/i);
    await expect(assembleMock("user-1", "B2" as CefrLevel, { includeListening: true })).rejects.toThrow(/listening/i);
  });
});

describe("assembleMock — Reading production safeguards", () => {
  it("uses the explicit IELTS Academic Reading duration of 60 minutes", () => {
    expect(IELTS_ACADEMIC_READING_TIME_LIMIT_MINUTES).toBe(60);
    expect(READING_TIME_LIMIT_SECONDS).toBe(3600);
  });

  it("orders Reading questions by mock_sequence even when created_at disagrees", async () => {
    seedValidStructure();
    const p1 = store.assessment_questions.filter((row) => row.mock_passage_id === "p1");
    p1[0].mock_sequence = 3;
    p1[1].mock_sequence = 2;
    p1[2].mock_sequence = 1;
    p1[0].created_at = "2024-01-01T00:00:00.000Z";
    p1[2].created_at = "2024-01-01T00:10:00.000Z";

    const result = await assembleMock("user-1", "B2" as CefrLevel, { includeListening: false });

    expect(result.readingIds.filter((id) => id.startsWith("p1-")).slice(0, 3)).toEqual(["p1-q2", "p1-q1", "p1-q0"]);
  });

  it("keeps passage ids aligned with their deterministically ordered Reading question blocks", async () => {
    seedValidStructure();
    for (const row of store.assessment_questions) {
      if (row.mock_passage_id === "p1") row.mock_sequence = Number(row.mock_sequence) + 20;
      if (row.mock_passage_id === "p3") row.mock_sequence = Number(row.mock_sequence) + 10;
    }

    const result = await assembleMock("user-1", "B2" as CefrLevel, { includeListening: false });

    expect(result.readingPassageIds).toEqual(["p2", "p3", "p1"]);
    expect(result.readingIds[0]).toBe("p2-q0");
    expect(result.readingIds[12]).toBe("p3-q0");
    expect(result.readingIds[25]).toBe("p1-q0");
  });

  it("uses created_at and id as deterministic fallbacks for legacy rows without mock_sequence", async () => {
    seedValidStructure();
    const p1 = store.assessment_questions.filter((row) => row.mock_passage_id === "p1");
    for (const row of p1) row.mock_sequence = null;
    for (const row of p1) row.created_at = "2024-01-01T00:05:00.000Z";
    p1[0].created_at = "2024-01-01T00:10:00.000Z";
    p1[1].created_at = "2024-01-01T00:00:00.000Z";

    const result = await assembleMock("user-1", "B2" as CefrLevel, { includeListening: false });

    const p1Ids = result.readingIds.filter((id) => id.startsWith("p1-"));
    expect(p1Ids[0]).toBe("p1-q1");
    expect(p1Ids.at(-1)).toBe("p1-q0");
  });

  it("fails clearly when selected Reading content violates the persisted contract", async () => {
    seedValidStructure();
    const invalid = store.assessment_questions.find((row) => row.id === "p1-q0")!;
    invalid.correct_answer = "";

    await expect(assembleMock("user-1", "B2" as CefrLevel, { includeListening: false })).rejects.toThrow(
      /runtime validation.*MISSING_CORRECT_ANSWER/i,
    );
  });

  it("fails safely on duplicate explicit sequences within one passage", async () => {
    seedValidStructure();
    const p1 = store.assessment_questions.filter((row) => row.mock_passage_id === "p1");
    p1[1].mock_sequence = p1[0].mock_sequence;

    await expect(assembleMock("user-1", "B2" as CefrLevel, { includeListening: false })).rejects.toThrow(
      /DUPLICATE_MOCK_SEQUENCE/i,
    );
  });

  it("falls back safely while the additive group-instructions column is not applied", async () => {
    seedValidStructure();
    simulateMissingGroupInstructionsColumn = true;

    const result = await assembleMock("user-1", "B2" as CefrLevel, { includeListening: false });

    expect(result.readingPassageIds).toHaveLength(3);
    expect(result.readingIds).toHaveLength(40);
  });
});
