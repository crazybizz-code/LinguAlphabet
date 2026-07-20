import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsView } from "@/components/settings/SettingsView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Settings",
  description: "Manage your LinguABC account, preferences, and notification settings.",
  path: "/settings",
  index: false,
});

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .single();
  if (!profile?.onboarding_completed) redirect("/welcome");

  return <SettingsView email={user.email ?? ""} />;
}
