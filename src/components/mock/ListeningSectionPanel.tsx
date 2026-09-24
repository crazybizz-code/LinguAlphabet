"use client";

import { ListeningAudioPlayer } from "@/components/assessment/ListeningAudioPlayer";
import { ListeningInstructions } from "@/components/assessment/ListeningInstructions";
import { ListeningQuestionGroup } from "./ListeningQuestionGroup";
import type { ClientListeningQuestionGroup, ClientListeningSection } from "./listening-state";

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

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-5 max-lg:px-6 max-md:px-4">
      <div className="mb-4">
        <p className="text-[11px] font-semibold tracking-wide text-text-tertiary">
          Listening Section {sectionNumber}
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-text-primary">
          {section.title ?? `Section ${sectionNumber}`}
        </h1>
      </div>

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

      <div className="space-y-5 pb-3">
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
          />
        ))}
      </div>
    </div>
  );
}
