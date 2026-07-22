/**
 * Realistic static mock records — no database, no Supabase (Sprint 3
 * rule). Each tool looks a record up by id here instead of querying
 * anything. Swapping this for real data later is a change to *this file
 * only* (or, more precisely, to whatever repository function replaces
 * it) — see docs/ai-architecture.md's "Future database integration".
 */

export interface MockPodcast {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  durationSeconds: number;
  topics: string[];
}

export interface MockTranscriptSegment {
  speaker: string;
  text: string;
  timestampSeconds: number;
}

export interface MockArticle {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  readingTimeMinutes: number;
  topics: string[];
}

export interface MockQuizQuestion {
  prompt: string;
  choices: string[];
  correctChoiceIndex: number;
}

export interface MockQuiz {
  id: string;
  title: string;
  cefrLevel: string;
  questions: MockQuizQuestion[];
}

export interface MockVocabularyEntry {
  word: string;
  partOfSpeech: string;
  definition: string;
  exampleSentence: string;
  cefrLevel: string;
}

export const MOCK_PODCASTS: Record<string, MockPodcast> = {
  p1: {
    id: "p1",
    title: "Everyday Conversations Vol. 3",
    description: "Two friends catch up over coffee, covering small talk, weekend plans, and casual disagreement.",
    cefrLevel: "B1",
    durationSeconds: 312,
    topics: ["small talk", "daily life", "friendship"],
  },
  p2: {
    id: "p2",
    title: "Job Interview Survival Guide",
    description: "A mock interview walkthrough covering common questions and how to answer them confidently.",
    cefrLevel: "B2",
    durationSeconds: 480,
    topics: ["career", "interviews", "formal register"],
  },
};

export const MOCK_TRANSCRIPTS: Record<string, MockTranscriptSegment[]> = {
  p1: [
    { speaker: "Ava", text: "Hey! It's been ages, how have you been?", timestampSeconds: 0 },
    { speaker: "Ben", text: "Pretty good, just busy with work. You?", timestampSeconds: 4 },
    { speaker: "Ava", text: "Can't complain. I couldn't agree more that this weather is amazing though.", timestampSeconds: 9 },
    { speaker: "Ben", text: "Right? I couldn't agree more. Perfect for a walk later.", timestampSeconds: 14 },
  ],
  p2: [
    { speaker: "Interviewer", text: "So, tell me a bit about yourself.", timestampSeconds: 0 },
    { speaker: "Candidate", text: "Sure — I've been working in customer support for about three years.", timestampSeconds: 5 },
  ],
};

export const MOCK_ARTICLES: Record<string, MockArticle> = {
  a1: {
    id: "a1",
    title: "The Rise of Remote Work",
    description: "How remote work changed expectations around flexibility, productivity, and office culture.",
    cefrLevel: "B2",
    readingTimeMinutes: 4,
    topics: ["work", "technology", "society"],
  },
  a2: {
    id: "a2",
    title: "A Short History of Coffee",
    description: "From Ethiopian highlands to your morning cup — how coffee spread across the world.",
    cefrLevel: "B1",
    readingTimeMinutes: 3,
    topics: ["history", "food and drink"],
  },
};

export const MOCK_QUIZZES: Record<string, MockQuiz> = {
  q1: {
    id: "q1",
    title: "Present Perfect vs. Past Simple",
    cefrLevel: "B1",
    questions: [
      {
        prompt: "Which sentence is correct?",
        choices: ["I have seen that movie yesterday.", "I saw that movie yesterday.", "I have saw that movie yesterday."],
        correctChoiceIndex: 1,
      },
      {
        prompt: "Complete: 'She ___ in London for five years.'",
        choices: ["lived", "has lived", "is living"],
        correctChoiceIndex: 1,
      },
    ],
  },
};

export const MOCK_VOCABULARY: Record<string, MockVocabularyEntry> = {
  "couldn't agree more": {
    word: "couldn't agree more",
    partOfSpeech: "idiom",
    definition: "Used to express complete agreement with what someone just said.",
    exampleSentence: "\"This coffee is amazing.\" \"I couldn't agree more.\"",
    cefrLevel: "B1",
  },
  reckon: {
    word: "reckon",
    partOfSpeech: "verb",
    definition: "To think or believe something, often used informally.",
    exampleSentence: "I reckon it's going to rain later.",
    cefrLevel: "B2",
  },
};

export const MOCK_PROGRESS = {
  totalLessonsCompleted: 42,
  weeklyGoalMinutes: 150,
  weeklyMinutesSoFar: 95,
  longestStreak: 21,
};
