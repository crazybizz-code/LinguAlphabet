import type { MockOptionPoolItem, MockQuestionType, WordLimit } from "@/lib/mock/content/types";
import type { QuestionType } from "@/types/assessment";

/**
 * The type a Mock question can carry at runtime: any of the 13 real IELTS
 * types the content contract defines (src/lib/mock/content/types.ts), plus
 * the three legacy generic values Placement/Practice still use and which
 * remain valid in the DB's widened CHECK (see
 * supabase/mock-question-content-schema.sql). Deliberately a union of the
 * EXISTING contract type and the EXISTING legacy type -- no new type names
 * are invented here.
 */
export type ClientQuestionType = MockQuestionType | QuestionType;

/** Client-safe mock question — correctAnswer, acceptedAnswers and explanation stripped server-side. */
export interface ClientQuestion {
  id: string;
  skill: "reading" | "listening";
  type: ClientQuestionType;
  difficulty: string;
  passage: string | null;
  passageTitle: string | null;
  audioUrl: string | null;
  question: string;
  options: string[] | null;
  sequenceNumber: number;
  /** The passage this question belongs to (reading) -- see supabase/mock-structure-schema.sql. Null for a listening question or a legacy ungrouped question. */
  passageId: string | null;
  /** The section this question belongs to (listening) -- see supabase/mock-structure-schema.sql. Null for a reading question or a legacy ungrouped question. */
  sectionId: string | null;
  /** Shared option pool for a matching/labelling-family question (assessment_questions.option_pool).
   * The learner picks one of these; the value submitted is the item's `id`, never its text. */
  optionPool: MockOptionPoolItem[] | null;
  /** Declared word limit for a completion-family answer, decoded from
   * assessment_questions.answer_word_limit via the contract's own
   * wordLimitFromDbLabel(). Null for every non-completion question. */
  wordLimit: WordLimit | null;
  /** The shared task this question belongs to (assessment_questions.mock_group_id). Null for a standalone question. */
  groupId: string | null;
  /** Task instruction shared by every question in this group, e.g. "Questions
   * 1-4: Which paragraph contains the following information? NB You may use
   * any letter more than once." (assessment_questions.mock_group_instructions).
   * Rendered once above the first question of the group, never per question.
   * Null for a standalone question, and for any content authored before
   * supabase/mock-group-instructions-schema.sql was applied. */
  groupInstructions: string | null;
  /** Authored 1-based position within the structural parent (assessment_questions.mock_sequence). Null for legacy content. */
  mockSequence: number | null;
  /** Shown before the section begins — null until the authoring pipeline writes it. */
  sectionInstruction: string | null;
  /** Shown above the question stem — null until authored. */
  questionInstruction: string | null;
  /** Shown with the audio player — null until authored. */
  audioInstruction: string | null;
}
