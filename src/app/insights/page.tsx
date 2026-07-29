import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { computeProductIntelligenceKpis } from "@/lib/analytics/kpis";
import { isAdminEmail } from "@/lib/analytics/admin";
import { InsightsDashboard } from "@/components/insights/InsightsDashboard";

export const metadata: Metadata = { title: "Product Intelligence — LinguABC", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Product Intelligence Sprint — the internal dashboard answering the
 * eleven KPIs in the brief (src/lib/analytics/kpis.ts does the actual
 * computation). Deliberately outside the (app) route group: this isn't a
 * learner-facing screen and shouldn't inherit the sidebar/bottom-nav/
 * Tuto chrome.
 *
 * Access control: there is no role/permission system in LinguABC today
 * (confirmed across every table in supabase-schema.sql) — profiles has
 * no `role` or `is_admin` column. Rather than fabricate one, this gates
 * on a plain ADMIN_EMAILS allowlist read at request time. Fails closed:
 * an unset ADMIN_EMAILS means literally nobody can view this page, not
 * "anyone can." A real multi-admin product would need a proper roles
 * table; this is the minimal honest thing that works today.
 */
export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email, process.env.ADMIN_EMAILS)) notFound();

  const kpis = await computeProductIntelligenceKpis(createServiceClient());

  return <InsightsDashboard kpis={kpis} />;
}
