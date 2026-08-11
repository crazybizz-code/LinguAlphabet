/** Client-safe mock question — correctAnswer and explanation stripped server-side. */
export interface ClientQuestion {
  id: string;
  skill: "reading" | "listening";
  type: "mc" | "tf" | "fill";
  difficulty: string;
  passage: string | null;
  passageTitle: string | null;
  audioUrl: string | null;
  question: string;
  options: string[] | null;
  sequenceNumber: number;
  /** Shown before the section begins — null until the authoring pipeline writes it. */
  sectionInstruction: string | null;
  /** Shown above the question stem — null until authored. */
  questionInstruction: string | null;
  /** Shown with the audio player — null until authored. */
  audioInstruction: string | null;
}
