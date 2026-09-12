import type { MockOptionPoolItem } from "@/lib/mock/content/types";
import type { ClientListeningQuestionGroup } from "./listening-state";

export interface ChooseTwoPersistenceUpdate {
  questionId: string;
  sequenceNumber: number;
  answer: string | null;
}

function samePool(left: MockOptionPoolItem[] | null, right: MockOptionPoolItem[] | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isClientChooseTwoGroup(group: ClientListeningQuestionGroup): boolean {
  const [first, second] = group.questions;
  return group.groupId !== null
    && group.questions.length === 2
    && first.type === "multiple_choice"
    && second.type === "multiple_choice"
    && (first.optionPool?.length ?? 0) >= 3
    && samePool(first.optionPool, second.optionPool);
}

export function chooseTwoOptionPool(group: ClientListeningQuestionGroup): MockOptionPoolItem[] {
  return isClientChooseTwoGroup(group) ? (group.questions[0].optionPool ?? []) : [];
}

export function normalizeChooseTwoSelections(
  group: ClientListeningQuestionGroup,
  selections: readonly string[],
): string[] {
  const selected = new Set(selections);
  return chooseTwoOptionPool(group)
    .map((option) => option.id)
    .filter((id) => selected.has(id))
    .slice(0, 2);
}

export function hydrateChooseTwoSelections(
  group: ClientListeningQuestionGroup,
  answers: Record<string, string | null>,
): string[] {
  return normalizeChooseTwoSelections(
    group,
    group.questions.map((question) => answers[question.id]).filter((answer): answer is string => Boolean(answer)),
  );
}

export function toggleChooseTwoSelection(
  group: ClientListeningQuestionGroup,
  currentSelections: readonly string[],
  optionId: string,
): string[] {
  const current = normalizeChooseTwoSelections(group, currentSelections);
  if (current.includes(optionId)) {
    return current.filter((selection) => selection !== optionId);
  }
  if (current.length >= 2 || !chooseTwoOptionPool(group).some((option) => option.id === optionId)) {
    return current;
  }
  return normalizeChooseTwoSelections(group, [...current, optionId]);
}

export function encodeChooseTwoResponses(
  group: ClientListeningQuestionGroup,
  selections: readonly string[],
): ChooseTwoPersistenceUpdate[] {
  const normalized = normalizeChooseTwoSelections(group, selections);
  return [...group.questions]
    .sort((left, right) => (left.mockSequence ?? left.sequenceNumber) - (right.mockSequence ?? right.sequenceNumber))
    .map((question, index) => ({
      questionId: question.id,
      sequenceNumber: question.sequenceNumber,
      answer: normalized[index] ?? null,
    }));
}
