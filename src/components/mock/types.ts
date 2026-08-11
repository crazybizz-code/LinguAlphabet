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
}
