import { describe, it, expect } from "vitest";
import { computeLearnerState } from "./engine";
import type { LearningSignal, QuizAnswerEvidence } from "@/ai/data";

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function quizAnswer(overrides: Partial<LearningSignal> & { evidence: Partial<QuizAnswerEvidence> }): LearningSignal {
  const evidence: QuizAnswerEvidence = {
    questionId: "q1",
    quizId: "content-1",
    learnerId: "learner-1",
    contentId: "content-1",
    grammarTopic: null,
    vocabularyWord: null,
    correct: false,
    chosenAnswer: "",
    correctAnswer: "",
    timestamp: iso(1),
    ...overrides.evidence,
  };

  return {
    type: "quiz_answer_recorded",
    topic: null,
    skill: null,
    source: "content_session",
    confidence: null,
    createdAt: iso(1),
    ...overrides,
    evidence: evidence as unknown as Record<string, unknown>,
  };
}

describe("computeLearnerState — cross-skill contamination regression", () => {
  /**
   * The exact bug reported after Phase 5: computeGrammarMastery filtered
   * quiz_answer_recorded signals by `type` only and hardcoded every
   * output record's skill to "grammar", so a vocabulary-tagged answer
   * was silently mislabeled and folded into grammarMastery. This test
   * fails immediately if that regresses.
   */
  it("never lets a vocabulary-tagged quiz answer affect grammar mastery", () => {
    const signals: LearningSignal[] = [
      quizAnswer({ topic: "reckon", skill: "vocabulary", evidence: { grammarTopic: null, vocabularyWord: "reckon", correct: true }, createdAt: iso(1) }),
      quizAnswer({ topic: "reckon", skill: "vocabulary", evidence: { grammarTopic: null, vocabularyWord: "reckon", correct: true }, createdAt: iso(2) }),
      quizAnswer({ topic: "reckon", skill: "vocabulary", evidence: { grammarTopic: null, vocabularyWord: "reckon", correct: true }, createdAt: iso(3) }),
    ];

    const state = computeLearnerState("learner-1", signals);

    expect(state.grammarMastery.find((record) => record.topic === "reckon")).toBeUndefined();
    expect(state.grammarMastery).toHaveLength(0);

    const vocabRecord = state.vocabularyMastery.find((record) => record.topic === "reckon");
    expect(vocabRecord).toBeDefined();
    expect(vocabRecord?.skill).toBe("vocabulary");
    expect(vocabRecord?.status).toBe("mastered");
  });

  it("never lets a grammar-tagged quiz answer affect vocabulary mastery", () => {
    const signals: LearningSignal[] = [
      quizAnswer({ topic: "reported-speech", skill: "grammar", evidence: { grammarTopic: "reported-speech", vocabularyWord: null, correct: false }, createdAt: iso(1) }),
      quizAnswer({ topic: "reported-speech", skill: "grammar", evidence: { grammarTopic: "reported-speech", vocabularyWord: null, correct: false }, createdAt: iso(2) }),
    ];

    const state = computeLearnerState("learner-1", signals);

    expect(state.vocabularyMastery.find((record) => record.topic === "reported-speech")).toBeUndefined();
    expect(state.vocabularyMastery).toHaveLength(0);

    const grammarRecord = state.grammarMastery.find((record) => record.topic === "reported-speech");
    expect(grammarRecord).toBeDefined();
    expect(grammarRecord?.skill).toBe("grammar");
    expect(grammarRecord?.status).toBe("weak");
  });

  it("keeps every record's skill field consistent with the signal that produced it when grammar and vocabulary evidence arrive interleaved", () => {
    const signals: LearningSignal[] = [
      quizAnswer({ topic: "present-perfect", skill: "grammar", evidence: { grammarTopic: "present-perfect", correct: true }, createdAt: iso(1) }),
      quizAnswer({ topic: "procrastinate", skill: "vocabulary", evidence: { vocabularyWord: "procrastinate", correct: true }, createdAt: iso(1) }),
      quizAnswer({ topic: "present-perfect", skill: "grammar", evidence: { grammarTopic: "present-perfect", correct: true }, createdAt: iso(2) }),
      quizAnswer({ topic: "procrastinate", skill: "vocabulary", evidence: { vocabularyWord: "procrastinate", correct: true }, createdAt: iso(2) }),
      quizAnswer({ topic: "present-perfect", skill: "grammar", evidence: { grammarTopic: "present-perfect", correct: true }, createdAt: iso(3) }),
      quizAnswer({ topic: "procrastinate", skill: "vocabulary", evidence: { vocabularyWord: "procrastinate", correct: true }, createdAt: iso(3) }),
    ];

    const state = computeLearnerState("learner-1", signals);

    for (const record of state.grammarMastery) expect(record.skill).toBe("grammar");
    for (const record of state.vocabularyMastery) expect(record.skill).toBe("vocabulary");
    for (const record of state.topicMastery) {
      if (record.topic === "present-perfect") expect(record.skill).toBe("grammar");
      if (record.topic === "procrastinate") expect(record.skill).toBe("vocabulary");
    }
  });

  it("routes a skill that has no dedicated LearnerState field yet into topicMastery automatically, with zero special-casing required", () => {
    // Proves the extensibility claim: a skill this engine has never seen
    // named in its code ("speaking") still ends up correctly bucketed.
    const signals: LearningSignal[] = [
      quizAnswer({ topic: "small-talk-opener", skill: "speaking", evidence: { correct: true }, createdAt: iso(1) }),
      quizAnswer({ topic: "small-talk-opener", skill: "speaking", evidence: { correct: true }, createdAt: iso(2) }),
      quizAnswer({ topic: "small-talk-opener", skill: "speaking", evidence: { correct: true }, createdAt: iso(3) }),
    ];

    const state = computeLearnerState("learner-1", signals);

    const record = state.topicMastery.find((r) => r.topic === "small-talk-opener");
    expect(record).toBeDefined();
    expect(record?.skill).toBe("speaking");
    expect(record?.status).toBe("mastered");
    // Correctly absent from both named fields — neither grammar nor vocabulary.
    expect(state.grammarMastery.find((r) => r.topic === "small-talk-opener")).toBeUndefined();
    expect(state.vocabularyMastery.find((r) => r.topic === "small-talk-opener")).toBeUndefined();
  });

  it("excludes a quiz_answer_recorded signal with skill: null from every mastery bucket rather than guessing a skill for it", () => {
    const signals: LearningSignal[] = [quizAnswer({ topic: "some-topic", skill: null, evidence: { correct: true }, createdAt: iso(1) })];

    const state = computeLearnerState("learner-1", signals);

    expect(state.topicMastery).toHaveLength(0);
    expect(state.grammarMastery).toHaveLength(0);
    expect(state.vocabularyMastery).toHaveLength(0);
  });
});

describe("computeLearnerState — grammar mastery from quiz evidence", () => {
  it("marks a topic mastered after a 3-answer correct streak", () => {
    const signals: LearningSignal[] = [
      quizAnswer({ topic: "present-perfect", skill: "grammar", evidence: { grammarTopic: "present-perfect", correct: true }, createdAt: iso(1) }),
      quizAnswer({ topic: "present-perfect", skill: "grammar", evidence: { grammarTopic: "present-perfect", correct: true }, createdAt: iso(2) }),
      quizAnswer({ topic: "present-perfect", skill: "grammar", evidence: { grammarTopic: "present-perfect", correct: true }, createdAt: iso(3) }),
    ];
    const state = computeLearnerState("learner-1", signals);
    expect(state.grammarMastery.find((r) => r.topic === "present-perfect")?.status).toBe("mastered");
  });

  it("marks a topic weak after 2 incorrect answers with no correct one since", () => {
    const signals: LearningSignal[] = [
      quizAnswer({ topic: "reported-speech", skill: "grammar", evidence: { grammarTopic: "reported-speech", correct: false }, createdAt: iso(1) }),
      quizAnswer({ topic: "reported-speech", skill: "grammar", evidence: { grammarTopic: "reported-speech", correct: false }, createdAt: iso(2) }),
    ];
    const state = computeLearnerState("learner-1", signals);
    expect(state.grammarMastery.find((r) => r.topic === "reported-speech")?.status).toBe("weak");
  });
});

describe("computeLearnerState — vocabulary mastery from view/save repetition (unchanged by this fix)", () => {
  it("flags a word viewed 3+ times as weak", () => {
    const signals: LearningSignal[] = [
      { type: "vocabulary_viewed", topic: "reckon", skill: "vocabulary", evidence: {}, source: "vocabulary_lookup", confidence: null, createdAt: iso(1) },
      { type: "vocabulary_viewed", topic: "reckon", skill: "vocabulary", evidence: {}, source: "vocabulary_lookup", confidence: null, createdAt: iso(2) },
      { type: "vocabulary_viewed", topic: "reckon", skill: "vocabulary", evidence: {}, source: "vocabulary_lookup", confidence: null, createdAt: iso(3) },
    ];
    const state = computeLearnerState("learner-1", signals);
    expect(state.vocabularyMastery.find((r) => r.topic === "reckon")?.status).toBe("weak");
  });

  it("never reaches 'mastered' from view/save evidence alone", () => {
    const signals: LearningSignal[] = [
      { type: "vocabulary_saved", topic: "procrastinate", skill: "vocabulary", evidence: {}, source: "vocabulary_lookup", confidence: null, createdAt: iso(1) },
    ];
    const state = computeLearnerState("learner-1", signals);
    expect(state.vocabularyMastery.find((r) => r.topic === "procrastinate")?.status).toBe("emerging");
  });
});

describe("computeLearnerState — momentum and recency", () => {
  it("flags increasing momentum when completions cluster more recently", () => {
    const signals: LearningSignal[] = [
      { type: "article_completed", topic: null, skill: "reading", evidence: {}, source: "content_session", confidence: null, createdAt: iso(1) },
      { type: "article_completed", topic: null, skill: "reading", evidence: {}, source: "content_session", confidence: null, createdAt: iso(2) },
      { type: "podcast_completed", topic: null, skill: "listening", evidence: {}, source: "content_session", confidence: null, createdAt: iso(9) },
    ];
    const state = computeLearnerState("learner-1", signals);
    expect(state.momentum.trend).toBe("increasing");
  });
});
