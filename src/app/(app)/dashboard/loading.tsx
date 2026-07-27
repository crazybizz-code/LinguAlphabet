import { PageLoading } from "@/components/layout/PageLoading";

/**
 * Shown while the Server Component page awaits profile/content/progress
 * queries — the Learning Brain computing today's mission is a real,
 * meaningful moment, so it gets a real Tuto pose rather than a generic
 * spinner. Uses "thinking" (not "typing-laptop" — that pose's underlying
 * asset, pointing.png, renders with a broken transparency/checkerboard
 * artifact against the mix-blend-mode frame every other pose uses
 * cleanly; docs/ux-launch-audit.md P0).
 */
export default function DashboardLoading() {
  return <PageLoading pose="thinking" message="Tuto is preparing your mission…" />;
}
