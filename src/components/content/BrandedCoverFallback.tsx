import { BookOpen, Headphones } from "lucide-react";
import { Tuto, type TutoPose } from "@/components/mascot/Tuto";

export type CoverContentType = "article" | "podcast";

/**
 * Replaces the old category-guessed local photo (thumbnailFallback.ts,
 * removed) as the fallback tier for ArticleCard/PodcastCard: one
 * consistent, deliberate branded cover per content type, never a
 * per-article guess. Same soft-orange family docs/design-system.md
 * defines everywhere else in the product (Tuto's own glow gradient,
 * `--color-primary-lighter`/`-light`) — a calm, premium "this is Tuto's
 * shelf" cover, not a missing-image box. Poses are real, official Tuto
 * renders only (Tuto.tsx's own rule) — "pointing" (an engaged, presenting
 * gesture) for articles, "listening" (raised open hand) for podcasts;
 * "wave" is reserved for Welcome/onboarding per Tuto.tsx's own comment,
 * so it's deliberately not used here.
 */
const COVER_CONFIG: Record<CoverContentType, { pose: TutoPose; Icon: typeof BookOpen; label: string }> = {
  article: { pose: "pointing", Icon: BookOpen, label: "Article" },
  podcast: { pose: "listening", Icon: Headphones, label: "Podcast" },
};

export function BrandedCoverFallback({ contentType }: { contentType: CoverContentType }) {
  const { pose, Icon, label } = COVER_CONFIG[contentType];

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(135deg, var(--color-primary-lighter) 0%, var(--color-primary-light) 100%)" }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 42%, var(--color-primary-soft) 0%, transparent 70%)" }}
        aria-hidden="true"
      />
      <Tuto pose={pose} size="md" animation="float" className="relative z-[1]" alt="" />
      <span className="absolute bottom-3 right-3 z-[1] flex items-center gap-1 rounded-full bg-text-primary/80 px-2.5 py-1 text-[10px] font-semibold text-text-on-primary">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
