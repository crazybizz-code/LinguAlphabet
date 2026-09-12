import type { ClientQuestion } from "./types";

export interface ListeningSectionMetadata {
  id: string;
  title: string | null;
  audioUrl: string | null;
}

export interface ClientListeningQuestionGroup {
  key: string;
  groupId: string | null;
  instructions: string | null;
  questions: ClientQuestion[];
}

export interface ClientListeningSection {
  sectionId: string;
  title: string | null;
  audioUrl: string | null;
  orderedQuestions: ClientQuestion[];
  questionGroups: ClientListeningQuestionGroup[];
}

export interface ListeningLocation {
  sectionIndex: number;
  questionIndexInSection: number;
  section: ClientListeningSection;
  question: ClientQuestion;
}

function groupQuestions(questions: ClientQuestion[]): ClientListeningQuestionGroup[] {
  const groups = new Map<string, ClientListeningQuestionGroup>();

  for (const question of questions) {
    const key = question.groupId ? `group:${question.groupId}` : `question:${question.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.questions.push(question);
      if (!existing.instructions && question.groupInstructions) {
        existing.instructions = question.groupInstructions;
      }
      continue;
    }

    groups.set(key, {
      key,
      groupId: question.groupId,
      instructions: question.groupInstructions,
      questions: [question],
    });
  }

  return [...groups.values()];
}

/**
 * Reconstructs the persisted Listening structure without reordering it.
 * The attempt's sectionIds and question list were stored together by the
 * assembler, so their order is the runtime source of truth.
 */
export function buildListeningSections(
  sectionIds: string[],
  questions: ClientQuestion[],
  metadata: ListeningSectionMetadata[],
): ClientListeningSection[] {
  const metadataById = new Map(metadata.map((section) => [section.id, section]));

  return sectionIds.map((sectionId) => {
    const orderedQuestions = questions.filter((question) => question.sectionId === sectionId);
    const sectionMetadata = metadataById.get(sectionId);

    return {
      sectionId,
      title: sectionMetadata?.title ?? null,
      audioUrl: sectionMetadata?.audioUrl ?? orderedQuestions.find((question) => question.audioUrl)?.audioUrl ?? null,
      orderedQuestions,
      questionGroups: groupQuestions(orderedQuestions),
    };
  });
}

export function flattenListeningQuestions(sections: ClientListeningSection[]): ClientQuestion[] {
  return sections.flatMap((section) => section.orderedQuestions);
}

export function getListeningLocation(
  sections: ClientListeningSection[],
  globalQuestionIndex: number,
): ListeningLocation | null {
  let sectionStart = 0;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const questionIndexInSection = globalQuestionIndex - sectionStart;
    if (questionIndexInSection >= 0 && questionIndexInSection < section.orderedQuestions.length) {
      return {
        sectionIndex,
        questionIndexInSection,
        section,
        question: section.orderedQuestions[questionIndexInSection],
      };
    }
    sectionStart += section.orderedQuestions.length;
  }

  return null;
}
