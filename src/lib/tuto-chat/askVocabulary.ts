import type { VocabularyExplanation } from "@/ai/features/vocabulary";
import type { TutoContextInput } from "./types";

export type { VocabularyExplanation };

/** Client-side counterpart to src/app/api/ai/vocabulary/route.ts — a single JSON fetch, no streaming (the response is a complete structured object, not prose). */
export async function askVocabulary(word: string, context: TutoContextInput): Promise<VocabularyExplanation> {
  const response = await fetch("/api/ai/vocabulary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, context }),
  });

  if (!response.ok) {
    let message = "Tuto couldn't explain that word right now.";
    try {
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
        message = data.error;
      }
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  return response.json();
}
