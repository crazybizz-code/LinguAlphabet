import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCachedLearnerProfile } from "@/ai/data";
import { PracticeSessionClient } from "@/components/practice/PracticeSessionClient";
import type { PracticeType } from "@/components/practice/PracticeSessionClient";
import type { CefrLevel } from "@/types/content";
import { buildMetadata } from "@/lib/seo/metadata";

const VALID_TYPES = new Set<PracticeType>(["reading", "listening"]);

const TYPE_TITLES: Record<PracticeType, string> = {
  reading: "Reading Practice",
  listening: "Listening Practice",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const practiceType = VALID_TYPES.has(type as PracticeType) ? (type as PracticeType) : null;
  const title = practiceType ? TYPE_TITLES[practiceType] : "Practice";
  return buildMetadata({ title, description: "Targeted skill practice session.", path: `/practice/${type}`, index: false });
}

export default async function PracticeTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;

  if (!VALID_TYPES.has(type as PracticeType)) redirect("/practice");

  const practiceType = type as PracticeType;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, learnerProfile] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, onboarding_completed, placement_completed")
      .eq("user_id", user.id)
      .single(),
    getCachedLearnerProfile(supabase, user.id),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const cefrLevel: CefrLevel = learnerProfile.cefrLevel ?? "B1";
  const displayName = profile?.username ?? "there";

  return (
    <PracticeSessionClient
      practiceType={practiceType}
      cefrLevel={cefrLevel}
      displayName={displayName}
    />
  );
}
