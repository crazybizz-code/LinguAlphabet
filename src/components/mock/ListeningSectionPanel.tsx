"use client";

import { ListeningAudioPlayer } from "@/components/assessment/ListeningAudioPlayer";
import { ListeningInstructions } from "@/components/assessment/ListeningInstructions";
import { ListeningQuestionGroup } from "./ListeningQuestionGroup";
import type { ClientListeningQuestionGroup, ClientListeningSection } from "./listening-state";

/**
 * Sections rendered as an exam question paper (grouped blocks with inline
 * numbered blanks) rather than stacked question cards. Rolled out one
 * section at a time; within a paper section each group still picks its own
 * layout from its type and authored instructions.
 */
const PAPER_LAYOUT_SECTIONS = new Set([1]);

interface Props {
  section: ClientListeningSection;
  sectionNumber: number;
  currentQuestionId: string;
  answers: Record<string, string | null>;
  flags: Record<string, boolean>;
  audioAlreadyPlayed: boolean;
  onAudioPlay: () => void;
  onSelect: (questionId: string, answer: string) => void;
  onChooseTwoChange: (group: ClientListeningQuestionGroup, selections: string[]) => void;
  onNavigate: (questionId: string) => void;
  onToggleFlag: (questionId: string) => void;
}

export function ListeningSectionPanel({
  section,
  sectionNumber,
  currentQuestionId,
  answers,
  flags,
  audioAlreadyPlayed,
  onAudioPlay,
  onSelect,
  onChooseTwoChange,
  onNavigate,
  onToggleFlag,
}: Props) {
  const firstQuestion = section.orderedQuestions[0];
  const paper = PAPER_LAYOUT_SECTIONS.has(sectionNumber);

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-5 max-lg:px-6 max-md:px-4">
      {paper ? (
        <div className="mb-4 border-b-2 border-text-primary pb-2.5">
          <h1 className="text-lg font-bold uppercase tracking-[0.08em] text-text-primary">
            <span className="sr-only">Listening </span>Section {sectionNumber}
          </h1>
          {section.title && (
            <p className="mt-0.5 text-sm text-text-secondary">{section.title}</p>
          )}
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-[11px] font-semibold tracking-wide text-text-tertiary">
            Listening Section {sectionNumber}
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-text-primary">
            {section.title ?? `Section ${sectionNumber}`}
          </h1>
        </div>
      )}

      {section.audioUrl && (
        <div className="mb-5 space-y-3">
          <ListeningInstructions
            sectionInstruction={firstQuestion?.sectionInstruction}
            audioInstruction={firstQuestion?.audioInstruction}
          />
          <ListeningAudioPlayer
            key={section.sectionId}
            audioUrl={section.audioUrl}
            instruction={firstQuestion?.audioInstruction}
            initiallyPlayed={audioAlreadyPlayed}
            onPlay={onAudioPlay}
          />
        </div>
      )}

      <div className={paper ? "space-y-7 pb-6" : "space-y-5 pb-3"}>
        {section.questionGroups.map((group) => (
          <ListeningQuestionGroup
            key={group.key}
            group={group}
            currentQuestionId={currentQuestionId}
            answers={answers}
            flags={flags}
            onSelect={onSelect}
            onChooseTwoChange={onChooseTwoChange}
            onNavigate={onNavigate}
            onToggleFlag={onToggleFlag}
            variant={paper ? "paper" : "card"}
          />
        ))}
      </div>
    </div>
  );
}
