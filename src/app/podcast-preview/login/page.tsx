import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizePreviewRedirect } from "@/lib/preview/auth";
import { PreviewLoginForm } from "./PreviewLoginForm";

/** Operator-only page — not indexed, not linked from the learner UI. */
export const metadata = { robots: "noindex, nofollow" };

export default async function PreviewLoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  // If the user isn't logged in to LinguABC at all, send them to the real
  // login first. The real login will redirect back here, which then sends
  // them to the preview page once the operator cookie is also set.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { redirect: redirectTo } = await searchParams;
  const destination = sanitizePreviewRedirect(redirectTo);

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/podcast-preview/login?redirect=${encodeURIComponent(destination)}`)}`);
  }

  return <PreviewLoginForm redirectTo={destination} />;
}
