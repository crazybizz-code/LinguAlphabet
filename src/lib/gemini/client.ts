const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Thrown when every retry attempt still failed with a transient status
 * (429/500/502/503/504) — distinguished from a plain Error so callers (the
 * Content Engine pipeline) can tell "Gemini is temporarily struggling,
 * worth trying again on the next run" apart from a non-retryable failure
 * (bad request, missing key, malformed response shape), which fails fast.
 */
export class GeminiTransientError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin fetch wrapper — no SDK dependency for a single endpoint. Server-only:
 * GEMINI_API_KEY must never reach a Client Component (docs/coding-standards.md).
 * responseSchema forces structured JSON back from the model instead of
 * fragile markdown-fence/regex parsing of free text.
 *
 * Retries only the status codes that mean "try again later, not my fault"
 * (rate limit / server-side transient errors) — up to 3 times, with
 * exponential backoff (500ms, 1s, 2s) — before giving up and throwing
 * GeminiTransientError. Any other failure (missing key, 4xx client error,
 * malformed response) throws immediately without consuming a retry.
 */
export async function generateJson(prompt: string, responseSchema: object): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    if (response.ok) {
      const data: GeminiGenerateContentResponse = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Gemini API returned no content");
      }
      return text;
    }

    if (!RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    if (attempt === MAX_RETRIES) {
      throw new GeminiTransientError(`Gemini API error after ${MAX_RETRIES} retries: ${response.status} ${response.statusText}`);
    }

    await sleep(BASE_DELAY_MS * 2 ** attempt);
  }

  // Unreachable — the loop always returns or throws — but keeps TypeScript
  // satisfied that every path produces a value.
  throw new GeminiTransientError("Gemini API: exhausted retries");
}
