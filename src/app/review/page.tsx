import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchDueVocabulary } from "@/lib/vocabulary/review";
import { VocabularyReviewView } from "@/components/vocabulary/VocabularyReviewView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Word Review",
  description: "Quick spaced-repetition review of words you've saved.",
  path: "/review",
  index: false,
});

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const words = await fetchDueVocabulary();
  return <VocabularyReviewView words={words} />;
}
