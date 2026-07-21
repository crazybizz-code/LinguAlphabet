import { z } from "zod";
import { ToolResultSchema } from "./tools";

export const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string().min(1, "Message cannot be empty").max(8000, "Message is too long"),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string(),
  /** Present only once tool-calling exists (src/ai/tools) — always empty today. */
  toolResults: z.array(ToolResultSchema).optional(),
});
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

export const SystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string().min(1),
});
export type SystemMessage = z.infer<typeof SystemMessageSchema>;

/**
 * The union of every message role. Note: the AI Service always injects
 * Tuto's own system prompt (src/ai/prompts/tuto) — a client-supplied
 * "system" message is rejected at the API boundary (src/app/api/ai/chat),
 * this type just needs to represent the full shape a message can take.
 */
export const ConversationMessageSchema = z.discriminatedUnion("role", [
  UserMessageSchema,
  AssistantMessageSchema,
  SystemMessageSchema,
]);
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
