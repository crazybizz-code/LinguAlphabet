import type { ReactNode } from "react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getLearnerSidebarStats } from "@/lib/content/sidebar-stats";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SessionTracker } from "@/components/analytics/SessionTracker";

/**
 * Fetches the left rail's "Learning Status" numbers once, here, rather
 * than in every page under it — each page still does its own auth
 * redirect and its own (possibly larger) data fetch for its main content;
 * this only ever adds the small, shared cross-section the sidebar itself
 * needs. Never redirects on a missing user/profile itself — that stays
 * each page's own responsibility (see e.g. (app)/dashboard/page.tsx) so
 * this layout can't fight a page's own redirect logic; a signed-out or
 * mid-onboarding request here just renders the sidebar without stats,
 * and the page underneath redirects a moment later as it already does.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  const learnerStats = user ? await getLearnerSidebarStats(supabase, user.id) : null;

  return (
    <DashboardShell learnerStats={learnerStats}>
      <SessionTracker />
      {children}
    </DashboardShell>
  );
}
