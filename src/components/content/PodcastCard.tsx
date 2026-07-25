"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Headphones, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { resolveThumbnailFallback } from "@/lib/content/thumbnailFallback";
import { isAllowedImageHost } from "@/lib/content/allowedImageHosts";
import type { PodcastContent } from "@/types/content";

export interface PodcastCardProps {
  podcast: PodcastContent;
  /** "Tuto's Pick" badge — algorithmic, per-user, never a stored column (docs/domain-model.md). */
  tutosPick?: boolean;
  index?: number;
}

function formatMinutes(minutes: number) {
  return `${Math.round(minutes)} min`;
}

/**
 * Production bug fix: mirrors ArticleCard's identical fix exactly. The
 * previous version always started at tier "primary" and relied entirely
 * on <Image>'s onError to catch a bad thumbnailUrl. That covered a URL
 * that loads the image tag but fails at runtime (a dead link) — it did
 * NOT cover a URL whose hostname isn't in next.config.ts's
 * images.remotePatterns, which next/image rejects by THROWING a render
 * exception ("Invalid src prop... hostname is not configured") before any
 * <img> element — and therefore any onError event — ever exists. That's
 * exactly what happened in production when the active content source
 * changed to one whose domain was never allowlisted: every real
 * thumbnailUrl crashed the whole page, and onError never fired because
 * there was nothing to fire it. isAllowedImageHost is checked up front
 * now, so a disallowed host starts directly at the "fallback" tier and
 * <Image> never sees it at all.
 *
 * Tiers: the real thumbnail (only if its host is allowlisted) -> the same
 * local, category-matched editorial photo the query layer already uses
 * for a missing thumbnail (never a generic gray box) -> a pure CSS/icon
 * placeholder that can never itself fail to render. Same aspect-square
 * container at every tier, so layout never shifts.
 */
function useThumbnailState(thumbnailUrl: string, topics: readonly string[], tags: readonly string[], label: string) {
  const [tier, setTier] = useState<"primary" | "fallback" | "failed">(() =>
    isAllowedImageHost(thumbnailUrl) ? "primary" : "fallback",
  );
  const fallbackSrc = resolveThumbnailFallback({ topics, tags });

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && tier === "fallback" && !isAllowedImageHost(thumbnailUrl)) {
      console.warn(`[thumbnail] "${label}" thumbnailUrl host isn't in images.remotePatterns, skipping <Image>:`, thumbnailUrl);
    }
    // Only meant to log once for the initial disallowed-host case, not on every tier change (e.g. a later real load failure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleError() {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[thumbnail] failed to load for "${label}":`, tier === "primary" ? thumbnailUrl : fallbackSrc);
    }
    setTier((current) => (current === "primary" ? "fallback" : "failed"));
  }

  return { src: tier === "primary" ? thumbnailUrl : fallbackSrc, failed: tier === "failed", handleError };
}

/** Podcast tile used by Home's "Recommended by Tuto" and Explore's grid. */
export function PodcastCard({ podcast, tutosPick = false, index = 0 }: PodcastCardProps) {
  const thumbnail = useThumbnailState(podcast.thumbnailUrl, podcast.topics, podcast.tags, podcast.title);

  return (
    // Podcast Detail (/podcast/[id]) isn't built yet (task #31) — the only
    // real destination for a podcast today is the Learning Session itself,
    // so this links straight there rather than to a page that doesn't
    // exist. Revisit once Podcast Detail ships.
    <Link href={`/podcast/${podcast.id}/learn`} className="group block">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1], delay: index * 0.06 }}
        className="overflow-hidden rounded-2xl border border-border bg-bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
      >
        <div className="relative aspect-square overflow-hidden">
          {thumbnail.failed ? (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bg-muted to-border/40">
              <Headphones className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
            </div>
          ) : (
            <Image
              key={thumbnail.src}
              src={thumbnail.src}
              alt=""
              fill
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              onError={thumbnail.handleError}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          {tutosPick && (
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-bg-card/95 px-2.5 py-1 text-[10px] font-semibold text-primary shadow-sm">
              <Sparkles className="h-2.5 w-2.5" />
              Tuto&apos;s Pick
            </span>
          )}
          <span className="absolute right-3 top-3 rounded-full bg-text-primary/80 px-2.5 py-1 text-[10px] font-semibold text-text-on-primary">
            {podcast.cefrLevelMin}
          </span>
        </div>
        <div className="p-4">
          {podcast.tags[0] && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{podcast.tags[0]}</p>
          )}
          <h4 className="mt-1 line-clamp-2 font-bold leading-snug text-text-primary">{podcast.title}</h4>
          <div className="mt-2 flex items-center gap-1 text-xs text-text-tertiary">
            <Clock className="h-3 w-3" />
            {formatMinutes(podcast.estimatedTimeMinutes)}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
