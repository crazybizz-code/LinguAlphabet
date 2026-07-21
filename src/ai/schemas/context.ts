import { z } from "zod";
import { LearningContextSchema } from "@/ai/context/types";
import { ConversationMessageSchema } from "./messages";

export { LearningContextSchema };
export type { LearningContext } from "@/ai/context/types";

/**
 * The full container the AI Service needs for one request: the message
 * history plus (optionally) whatever LearningContext the caller has on
 * hand. `learningContext` is `.partial()` here because a caller often
 * knows only a couple of fields (e.g. just `currentScreen`) — the service
 * fills in the rest via buildLearningContext (src/ai/context/builder.ts).
 */
export const ConversationContextSchema = z.object({
  conversationId: z.string().optional(),
  messages: z.array(ConversationMessageSchema).min(1).max(50),
  learningContext: LearningContextSchema.partial().optional(),
});
export type ConversationContext = z.infer<typeof ConversationContextSchema>;
