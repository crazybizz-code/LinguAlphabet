import type { LearnerProfile } from "./types";
import type { GrammarMistakeRecord } from "./performance";

/**
 * Six example LearnerProfiles (Sprint 10), one per the brief's own
 * Teaching Adaptation categories (Beginner / Intermediate / Advanced /
 * Repeated mistakes / Fast learner / Slow learner) — real, complete
 * objects used both to sanity-check LearnerProfileSchema and as the
 * grounding for docs/ai-architecture.md's "Teaching Adaptation" examples.
 */
export const EXAMPLE_LEARNER_PROFILES: Record<string, LearnerProfile> = {
  beginner: {
    id: "learner-beginner-aziz",
    cefrLevel: "A2",
    learningGoal: "Travel and everyday conversation",
    nativeLanguage: "Uzbek",
    strongGrammarTopics: ["present-simple"],
    weakGrammarTopics: ["present-continuous"],
    strongVocabularyAreas: ["everyday life"],
    weakVocabularyAreas: ["travel", "food"],
    recentlyStudiedTopics: ["present-simple", "greetings"],
    recentMistakes: ["Dropped third-person -s: \"She work\" instead of \"She works\"."],
    preferredLearningStyle: "structured",
    learningPace: "steady",
    streak: 4,
    xp: 120,
    dailyGoalMinutes: 10,
    studyConsistency: { studyDaysLast30: 10, averageSessionMinutes: 8, longestStreak: 5 },
  },

  intermediate: {
    id: "learner-intermediate-dilnoza",
    cefrLevel: "B1",
    learningGoal: "Career and workplace English",
    nativeLanguage: "Uzbek",
    strongGrammarTopics: ["present-simple", "present-continuous"],
    weakGrammarTopics: ["present-perfect", "conditionals"],
    strongVocabularyAreas: ["daily routines"],
    weakVocabularyAreas: ["business idioms"],
    recentlyStudiedTopics: ["present-perfect"],
    recentMistakes: ["Mixed present perfect with a specific past time: \"I have seen him yesterday\"."],
    preferredLearningStyle: "conversational",
    learningPace: "steady",
    streak: 21,
    xp: 980,
    dailyGoalMinutes: 15,
    studyConsistency: { studyDaysLast30: 22, averageSessionMinutes: 15, longestStreak: 21 },
  },

  advanced: {
    id: "learner-advanced-elyor",
    cefrLevel: "C1",
    learningGoal: "Exam Preparation",
    nativeLanguage: "Uzbek",
    strongGrammarTopics: ["present-perfect", "passive-voice", "reported-speech"],
    weakGrammarTopics: ["conditionals"],
    strongVocabularyAreas: ["academic writing"],
    weakVocabularyAreas: ["idiomatic expressions"],
    recentlyStudiedTopics: ["conditionals", "reported-speech"],
    recentMistakes: ["Mixed second and third conditional forms in one sentence."],
    preferredLearningStyle: "reading-focused",
    learningPace: "fast",
    streak: 60,
    xp: 5400,
    dailyGoalMinutes: 25,
    studyConsistency: { studyDaysLast30: 29, averageSessionMinutes: 25, longestStreak: 60 },
  },

  /**
   * Same CEFR band as `intermediate`, but the signal that matters here
   * isn't the level — it's that the identical mistake keeps recurring
   * across sessions (see EXAMPLE_GRAMMAR_MISTAKE_RECORDS below), which is
   * a fundamentally different adaptation trigger than a one-off slip.
   */
  repeatedMistakes: {
    id: "learner-repeated-mistakes-karim",
    cefrLevel: "B1",
    learningGoal: "General fluency",
    nativeLanguage: "Uzbek",
    strongGrammarTopics: ["present-simple"],
    weakGrammarTopics: ["present-perfect"],
    strongVocabularyAreas: ["daily routines"],
    weakVocabularyAreas: [],
    recentlyStudiedTopics: ["present-perfect"],
    recentMistakes: [
      "Session 1: \"I have seen him yesterday.\"",
      "Session 3: \"I have finished it last week.\"",
      "Session 5: \"Have you went there?\"",
    ],
    preferredLearningStyle: "practice-heavy",
    learningPace: "steady",
    streak: 15,
    xp: 640,
    dailyGoalMinutes: 10,
    studyConsistency: { studyDaysLast30: 15, averageSessionMinutes: 12, longestStreak: 15 },
  },

  fastLearner: {
    id: "learner-fast-sara",
    cefrLevel: "B2",
    learningGoal: "General fluency",
    nativeLanguage: "Uzbek",
    strongGrammarTopics: ["present-simple", "present-continuous", "present-perfect", "passive-voice"],
    weakGrammarTopics: ["reported-speech"],
    strongVocabularyAreas: ["everyday life", "daily routines", "travel"],
    weakVocabularyAreas: [],
    recentlyStudiedTopics: ["passive-voice", "conditionals"],
    recentMistakes: [],
    preferredLearningStyle: "practice-heavy",
    learningPace: "fast",
    streak: 15,
    xp: 2100,
    dailyGoalMinutes: 30,
    studyConsistency: { studyDaysLast30: 15, averageSessionMinutes: 30, longestStreak: 15 },
  },

  /**
   * Long streak, but level hasn't moved much and the same kinds of
   * mistakes recur across unrelated topics — the opposite pace signal
   * from `fastLearner`, at a similar CEFR level to `beginner`.
   */
  needsMoreRepetition: {
    id: "learner-slow-jamshid",
    cefrLevel: "A2",
    learningGoal: "General fluency",
    nativeLanguage: "Uzbek",
    strongGrammarTopics: [],
    weakGrammarTopics: ["present-simple", "present-continuous"],
    strongVocabularyAreas: [],
    weakVocabularyAreas: ["everyday life", "travel"],
    recentlyStudiedTopics: ["present-simple", "present-continuous", "present-simple"],
    recentMistakes: [
      "Dropped third-person -s again this week: \"He go to work.\"",
      "Confused simple and continuous: \"I am know the answer.\"",
    ],
    preferredLearningStyle: "structured",
    learningPace: "needs-more-repetition",
    streak: 90,
    xp: 900,
    dailyGoalMinutes: 10,
    studyConsistency: { studyDaysLast30: 26, averageSessionMinutes: 10, longestStreak: 90 },
  },
};

/**
 * A handful of GrammarMistakeRecords for `repeatedMistakes` (Karim) —
 * demonstrates ./performance.ts's schema with realistic data, and is what
 * a real implementation would aggregate into that profile's
 * `recentMistakes` digest above.
 */
export const EXAMPLE_GRAMMAR_MISTAKE_RECORDS: GrammarMistakeRecord[] = [
  {
    type: "grammarMistake",
    id: "perf-karim-1",
    learnerId: "learner-repeated-mistakes-karim",
    occurredAt: "2026-06-02T09:15:00Z",
    grammarUnitId: "present-perfect",
    learnerText: "I have seen him yesterday.",
    correctedText: "I saw him yesterday.",
    note: "Specific past-time word forces past simple.",
  },
  {
    type: "grammarMistake",
    id: "perf-karim-2",
    learnerId: "learner-repeated-mistakes-karim",
    occurredAt: "2026-06-16T09:40:00Z",
    grammarUnitId: "present-perfect",
    learnerText: "I have finished it last week.",
    correctedText: "I finished it last week.",
    note: "Same pattern as perf-karim-1 — a specific past time with present perfect.",
  },
  {
    type: "grammarMistake",
    id: "perf-karim-3",
    learnerId: "learner-repeated-mistakes-karim",
    occurredAt: "2026-07-01T10:05:00Z",
    grammarUnitId: "present-perfect",
    learnerText: "Have you went there?",
    correctedText: "Have you been there?",
    note: "Present perfect attempted, but with the simple past form of the verb instead of the past participle.",
  },
];
