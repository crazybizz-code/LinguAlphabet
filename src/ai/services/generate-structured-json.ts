import { z } from "zod";
import { AIProviderError, getDefaultProvider } from "@/ai/providers";
import type { AIProviderMessage } from "@/ai/providers";
import { NO_RETRY_POLICY, createRetryController, sleep, type RetryPolicy } from "@/ai/retry";

/**
 * Headless structured generation — one model call, JSON out, validated.
 *
 * WHY THIS EXISTS SEPARATELY FROM generateStructuredResponse(). That one
 * is for learner-facing features: it builds a LearningContext, resolves
 * conversation memory, and runs the tool loop. Content Engine enrichment
 * is a batch job with no learner, no conversation and no tools — routing
 * it through that function would drag Tuto's whole world into ingestion
 * for no benefit, and would couple a cron job to chat state.
 *
 * So this is the sibling primitive: same provider gateway, same
 * telemetry, same structured-output contract, none of the learner
 * machinery. It calls `provider.complete()` directly.
 *
 * RETRY IS EXPLICIT AND OFF BY DEFAULT. The OpenRouter provider marks
 * errors retryable and never retries, so a batch caller must opt in with
 * a policy (src/ai/retry). Interactive callers pass nothing and fail
 * fast, because a user waiting 45 seconds for a reply is worse than an
 * error.
 *
 * FAILS CLOSED. Unparseable JSON or output that does not match the schema
 * throws — never a partial or coerced object. Neither is retried: a model
 * that answered with the wrong shape has not had a transient failure, and
 * retrying it burns quota to get the same answer.
 */

export interface GenerateStructuredJsonInput<T> {
  /** The full conversation to send. A single system+user pair is typical for a batch job. */
  messages: AIProviderMessage[];
  /** Validates the model's output and types the return. */
  schema: z.ZodType<T>;
  /**
   * Names the JSON schema on the wire and doubles as the telemetry
   * attribution label, so cost is attributable per feature without a
   * second parameter that could drift from the first.
   */
  schemaName: string;
  /** Omit for no retries. Pass BATCH_RETRY_POLICY for ingestion-style work. */
  retryPolicy?: RetryPolicy;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Zod emits a `$schema` declaration at the root. Providers validating
 * against OpenAI's structured-output subset reject keys outside it, and
 * the declaration carries no information the provider needs, so it is
 * dropped. Everything else Zod produces — `additionalProperties: false`
 * and a complete `required` list — is exactly what strict mode wants.
 */
function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** How many times the loop may go round before we stop regardless — a guard against a policy that never says stop. */
const MAX_TOTAL_ATTEMPTS = 32;

export async function generateStructuredJson<T>(input: GenerateStructuredJsonInput<T>): Promise<T> {
  const provider = getDefaultProvider();
  const retry = createRetryController(input.retryPolicy ?? NO_RETRY_POLICY);

  const completionInput = {
    messages: input.messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    responseFormat: { name: input.schemaName, schema: toStrictJsonSchema(input.schema) },
    feature: input.schemaName,
  };

  let content: string | undefined;

  for (let attempt = 0; attempt < MAX_TOTAL_ATTEMPTS; attempt++) {
    try {
      content = (await provider.complete(completionInput)).content;
      break;
    } catch (error) {
      // A non-provider error (a bug, an abort) is not something a retry
      // policy has any opinion about.
      if (!(error instanceof AIProviderError)) throw error;

      const status = error.status ?? 0;
      const decision =
        status === 429
          ? retry.onRateLimit(error.retryAfterMs ?? null)
          : status >= 500
            ? retry.onServerError()
            : null;

      // null means "not a retryable class of failure at all" — a 400, a
      // missing key, a 401. Those must fail immediately without consuming
      // an attempt, exactly as the direct client did.
      if (decision === null || decision.action === "give-up") throw error;

      await sleep(decision.delayMs);
    }
  }

  if (content === undefined) {
    throw new AIProviderError(
      `Structured generation for "${input.schemaName}" exhausted ${MAX_TOTAL_ATTEMPTS} attempts without a response`,
      504,
      true,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AIProviderError(`The model did not return valid JSON for "${input.schemaName}".`, 502, false);
  }

  const result = input.schema.safeParse(parsed);
  if (!result.success) {
    throw new AIProviderError(
      `The model's response did not match the "${input.schemaName}" schema: ${result.error.message}`,
      502,
      false,
    );
  }

  return result.data;
}
