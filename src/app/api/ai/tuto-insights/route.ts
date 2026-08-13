import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gatherLearnerEvidence } from "@/ai/data/learner-evidence";
import { generateTutoInsights } from "@/ai/services/tuto-insights";
import { AIProviderError } from "@/ai/providers";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/**
 * No request body — the server always loads the authenticated caller's own
 * evidence. Never accepts a user id from the client (see
 * gatherLearnerEvidence, which takes the id straight from the verified
 * Supabase session below, not from anything in the request).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const rateLimit = checkRateLimit(`tuto-insights:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const evidence = await gatherLearnerEvidence(supabase, user.id);
    const result = await generateTutoInsights(evidence);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof AIProviderError ? error.message : "Something went wrong generating insights.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
