import type { CefrLevel } from "./content";

export type AssessmentSkill = "reading" | "listening";
export type QuestionType = "mc" | "tf" | "fill";

export interface AssessmentQuestion {
  id: string;
  skill: AssessmentSkill;
  type: QuestionType;
  difficulty: CefrLevel;
  passage: string | null;
  passageTitle: string | null;
  audioUrl: string | null;
  question: string;
  /** Parsed from DB jsonb — string[] for mc/tf, null for fill. */
  options: string[] | null;
  correctAnswer: string;
  explanation: string | null;
  /** Content-driven instruction shown before the section begins (e.g. "You will hear a conversation…"). Null until the authoring pipeline writes it. */
  sectionInstruction: string | null;
  /** Instruction shown directly above the question stem. Null until authored. */
  questionInstruction: string | null;
  /** Instruction shown with the audio player (e.g. "Listen and answer the questions below"). Null until authored. */
  audioInstruction: string | null;
}

export interface QuestionResponse {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeTakenSeconds: number | null;
  sequenceNumber: number;
  difficulty: CefrLevel;
  skill: AssessmentSkill;
}

export interface SkillEstimate {
  cefrLevel: CefrLevel;
  abilityIndex: number;  // 0–5 fractional
  correct: number;
  total: number;
  weakSubAreas: string[];
}

export interface PlacementResult {
  attemptId: string;
  overallCefrLevel: CefrLevel;
  readingLevel: CefrLevel;
  listeningLevel: CefrLevel;
  estimatedBand: number;
  confidenceScore: number;
  weakAreas: string[];
  rawScores: {
    reading: { correct: number; total: number };
    listening: { correct: number; total: number };
  };
}

/** Returned by the /answer endpoint: either the next question or a signal that the assessment is complete. */
export type AnswerResponse =
  | { done: false; nextQuestion: AssessmentQuestion; questionsAnswered: number; estimatedTotal: number }
  | { done: true; result: PlacementResult };

/** Returned by the /start endpoint. */
export interface StartResponse {
  attemptId: string;
  firstQuestion: AssessmentQuestion;
  estimatedTotal: number;
}

/** Client-side state machine phases for the assessment UI. */
export type AssessmentPhase =
  | "intro"
  | "reading_intro"
  | "listening_intro"
  | "question"
  | "analysing"
  | "result"
  | "plan_generating"
  | "done";
