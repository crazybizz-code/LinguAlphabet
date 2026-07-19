import { PageLoading } from "@/components/layout/PageLoading";

/**
 * Shown while the Server Component page awaits profile/content/progress
 * queries — the Learning Brain computing today's mission is a real,
 * meaningful moment, so it gets Tuto's typing-laptop pose rather than a
 * generic spinner (product decision: Learning Brain preparing today's
 * mission → Typing Laptop).
 */
export default function DashboardLoading() {
  return <PageLoading pose="typing-laptop" message="Tuto is preparing your mission…" />;
}
