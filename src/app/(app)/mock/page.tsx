import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Clock, Headphones, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo/metadata";
import { MockStartButton } from "@/components/mock/MockStartButton";

export const metadata: Metadata = buildMetadata({
  title: "Mock Test",
  description: "Full timed reading and listening mock exam under exam conditions.",
  path: "/mock",
  index: false,
});

const FORMAT_DETAILS = [
  {
    icon: BookOpen,
    label: "Reading",
    detail: "10 questions · 30 minutes",
    color: "text-amber-500",
    bg: "bg-amber-50",
  },
  {
    icon: Headphones,
    label: "Listening",
    detail: "8 questions · 25 minutes",
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
  {
    icon: Clock,
    label: "Total time",
    detail: "~55 minutes",
    color: "text-green-500",
    bg: "bg-green-50",
  },
  {
    icon: ShieldCheck,
    label: "Graded instantly",
    detail: "Band estimate + weak areas",
    color: "text-primary",
    bg: "bg-primary-lighter",
  },
];

export default async function MockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, placement_completed")
    .eq("user_id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/welcome");

  // Use active plan's assessed level, fallback to B1
  const { data: plan } = await supabase
    .from("learning_plans")
    .select("assessed_cefr_level")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const targetCefrLevel = (plan?.assessed_cefr_level as string | null) ?? "B1";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Mock Test
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Simulate real exam conditions with a timed reading + listening session.
        </p>
      </div>

      {!profile.placement_completed && (
        <div className="mb-6 rounded-2xl border border-border bg-primary-lighter p-5">
          <p className="text-sm font-semibold text-text-primary">
            Complete your placement first
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Placement calibrates the mock difficulty to your level for accurate results.
          </p>
          <Link
            href="/assessment/placement"
            className="mt-3 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
          >
            Start Placement
          </Link>
        </div>
      )}

      {/* Format overview */}
      <div className="mb-6 rounded-[2rem] border border-border bg-bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Mock Format</h2>
        <div className="grid grid-cols-2 gap-3">
          {FORMAT_DETAILS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-border bg-bg-muted p-4"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}
                >
                  <Icon className={`h-4.5 w-4.5 ${item.color}`} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-primary">{item.label}</p>
                  <p className="text-[11px] text-text-secondary">{item.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="mb-6 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Before you begin</h2>
        <ul className="space-y-2 text-xs text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Requires a laptop or desktop screen — minimum 1024 px wide.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Answers save automatically — you can navigate between questions freely.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Each audio clip plays once only. Have headphones ready.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Results and band estimate are shown immediately after submission.
          </li>
        </ul>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-bg-card p-8 text-center shadow-sm">
        <MockStartButton
          targetCefrLevel={targetCefrLevel}
          disabled={!profile.placement_completed}
        />
      </div>
    </div>
  );
}
