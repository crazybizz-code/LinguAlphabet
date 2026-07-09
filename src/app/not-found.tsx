import Link from "next/link";
import { Tuto } from "@/components/mascot/Tuto";
import { Button } from "@/components/ui/Button";

/**
 * Branded 404 — replaces Next's default unstyled page for any unmatched
 * route. Links to /dashboard rather than "/" since that route already
 * redirects unauthenticated visitors to /login itself (src/app/page.tsx),
 * so this one link is the correct "take me home" destination either way.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <Tuto pose="thinking" size="md" animation="breathe" priority />
      <div>
        <h1 className="font-heading text-h1 font-bold text-text-primary">Page not found</h1>
        <p className="mt-2 text-body text-text-secondary">Tuto looked everywhere but couldn&apos;t find this page.</p>
      </div>
      <Link href="/dashboard">
        <Button variant="primary" className="h-12 rounded-full px-8">
          Back to Home
        </Button>
      </Link>
    </div>
  );
}
