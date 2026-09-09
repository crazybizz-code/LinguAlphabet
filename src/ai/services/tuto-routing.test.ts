import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerEvidence } from "@/ai/data/learner-evidence";
import { MAX_TOKENS, MODEL_ROUTING } from "@/ai/models";
import { generateStructuredJson } from "./generate-structured-json";
import { generateTutoCoaching } from "./tuto-coaching";
import { generateTutoInsights } from "./tuto-insights";

vi.mock("./generate-structured-json", () => ({
  generateStructuredJson: vi.fn(),
}));

const EVIDENCE: LearnerEvidence = {
  displayName: "Learner",
  assessedCefrLevel: null,
  assessedBand: null,
  targetBand: null,
  learningGoal: null,
  streak: 0,
  weakAreas: [],
  recentPractice: [],
  latestMock: null,
  mocksCompletedCount: 0,
  hasMeaningfulHistory: false,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Tuto structured feature routing", () => {
  it("routes coaching through Flash with its own output ceiling", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue({
      encouragement: "Keep going.",
      tips: [
        { title: null, text: "Tip one." },
        { title: null, text: "Tip two." },
        { title: null, text: "Tip three." },
      ],
    });

    await generateTutoCoaching(EVIDENCE);

    expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL_ROUTING.tutoChat,
        maxTokens: MAX_TOKENS.tutoCoaching,
        schemaName: "tuto_coaching",
      }),
    );
  });

  it("routes insights through Flash with its own output ceiling", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue({
      assessment: "You are getting started.",
      strengths: ["You began.", "You have a goal."],
      growthAreas: ["Build consistency.", "Collect practice evidence."],
      nextFocus: ["Complete placement.", "Try reading.", "Try listening."],
    });

    await generateTutoInsights(EVIDENCE);

    expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL_ROUTING.tutoChat,
        maxTokens: MAX_TOKENS.tutoInsights,
        schemaName: "tuto_insights",
      }),
    );
  });
});
