import { describe, it, expect } from "vitest";
import { chooseVoicesForEpisode, chooseVoicesForCombination, type VoiceCombination } from "./voiceRotation";

/**
 * Security-audit regression tests for voice governance. Uses the REAL
 * config.ts/voiceRegistry.ts (no mocking) -- these are pure, synchronous,
 * no I/O, so testing against the actual current production approval
 * state is both possible and more meaningful than a fake.
 */

describe("voice governance — approved combinations only", () => {
  it("TEST 11: female_female resolves to the approved Sarah+Hannah pair", () => {
    const result = chooseVoicesForCombination("female_female");
    expect(result.speaker0).toBe("Sarah");
    expect(result.speaker1).toBe("Hannah");
  });

  it("TEST 11: male_male resolves to the approved Ben+Leo pair", () => {
    const result = chooseVoicesForCombination("male_male");
    expect(result.speaker0).toBe("Ben");
    expect(result.speaker1).toBe("Leo");
  });

  it("TEST 11: male_female resolves to the approved Ben+Hannah pair", () => {
    const result = chooseVoicesForCombination("male_female");
    expect(result.speaker0).toBe("Ben");
    expect(result.speaker1).toBe("Hannah");
  });

  it("TEST 10: female_male (Maya+Alex) is not a valid VoiceCombination at all -- not even reachable by type", () => {
    // "female_male" is not a member of the VoiceCombination union (checked
    // at compile time everywhere else in the codebase); this test proves
    // the RUNTIME behavior for the case an unsafe cast forces it through
    // anyway (e.g. a malicious/buggy caller bypassing TypeScript).
    expect(() => chooseVoicesForCombination("female_male" as VoiceCombination)).toThrow(/no approved voice pair/i);
  });

  it("TEST 9: an unapproved/unknown combination string is rejected, never silently substituted", () => {
    expect(() => chooseVoicesForCombination("not_a_real_combination" as VoiceCombination)).toThrow();
  });

  it("Marcus (rejected) can never appear as a chosen speaker for any approved combination", () => {
    for (const combination of ["female_female", "male_male", "male_female"] as const) {
      const result = chooseVoicesForCombination(combination);
      expect(result.speaker0).not.toBe("Marcus");
      expect(result.speaker1).not.toBe("Marcus");
    }
  });
});

describe("chooseVoicesForEpisode — rotation never selects the disabled F+M pair", () => {
  it("cycles only through the 3 approved combinations, never female_male, across many episode numbers", () => {
    const seen = new Set<string>();
    for (let episodeNumber = 1; episodeNumber <= 30; episodeNumber++) {
      const result = chooseVoicesForEpisode(episodeNumber);
      seen.add(result.combination);
      expect(["female_female", "male_male", "male_female"]).toContain(result.combination);
      expect([result.speaker0, result.speaker1]).not.toContain("Maya");
      expect([result.speaker0, result.speaker1]).not.toContain("Alex");
      expect([result.speaker0, result.speaker1]).not.toContain("Marcus");
    }
    expect(seen).toEqual(new Set(["female_female", "male_male", "male_female"]));
  });

  it("cycles deterministically: female_female, male_male, male_female, then repeats", () => {
    expect(chooseVoicesForEpisode(1).combination).toBe("female_female");
    expect(chooseVoicesForEpisode(2).combination).toBe("male_male");
    expect(chooseVoicesForEpisode(3).combination).toBe("male_female");
    expect(chooseVoicesForEpisode(4).combination).toBe("female_female");
  });

  it("TEST 12 (continued): episode #006 (the true next number) rotates to male_female (Ben+Hannah)", () => {
    // (6-1) % 3 === 2 -> male_female, per the deterministic sequence above.
    const result = chooseVoicesForEpisode(6);
    expect(result.combination).toBe("male_female");
    expect(result.speaker0).toBe("Ben");
    expect(result.speaker1).toBe("Hannah");
  });
});
