import { Tuto } from "@/components/mascot/Tuto";

/**
 * Shown while the Server Component page awaits profile/content/progress
 * queries — the Learning Brain computing today's mission is a real,
 * meaningful moment, so it gets Tuto's typing-laptop pose rather than a
 * generic spinner (product decision: Learning Brain preparing today's
 * mission → Typing Laptop).
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Tuto pose="typing-laptop" size="sm" animation="floatSm" />
      <p className="text-sm font-medium text-text-tertiary">Tuto is preparing your mission&hellip;</p>
    </div>
  );
}
