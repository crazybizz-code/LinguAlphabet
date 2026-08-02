import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { isValidPreviewCookie, PREVIEW_COOKIE_NAME } from "@/lib/preview/auth";
import { getDraftPodcastByIdForPreview } from "@/lib/content/queries";
import { toLearningSessionContent } from "@/lib/learning-session/adapters/podcast";
import { LearningSessionView } from "@/components/learning-session/LearningSessionView";

/** Operator-only — never cached, never indexed. */
export const dynamic = "force-dynamic";
export const metadata = { robots: "noindex, nofollow" };

export default async function PodcastPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Guard 1: must be a real authenticated LinguABC user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/podcast-preview/${id}`)}`);
  }

  // Guard 2: must hold a valid operator preview cookie.
  const cookieStore = await cookies();
  const previewCookieValue = cookieStore.get(PREVIEW_COOKIE_NAME)?.value;
  if (!isValidPreviewCookie(previewCookieValue)) {
    redirect(`/podcast-preview/login?redirect=${encodeURIComponent(`/podcast-preview/${id}`)}`);
  }

  // Both guards passed — use the service client to bypass RLS and fetch
  // the draft. The anon/session client would return null for any draft row.
  const serviceClient = createServiceClient();
  const podcast = await getDraftPodcastByIdForPreview(serviceClient, id);
  if (!podcast) notFound();

  const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", user.id).single();

  return (
    <LearningSessionView
      content={toLearningSessionContent(podcast)}
      displayName={profile?.username ?? "there"}
      isMission={false}
      previewMode={true}
    />
  );
}
