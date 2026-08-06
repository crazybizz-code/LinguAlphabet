"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { BrandedCoverFallback } from "@/components/content/BrandedCoverFallback";
import { isAllowedImageHost } from "@/lib/content/allowedImageHosts";
import { formatCefrRange } from "@/lib/learning-brain/cefr";
import type { ArticleContent } from "@/types/content";

export interface ArticleCardProps {
  article: ArticleContent;
  /** "Tuto's Pick" badge — algorithmic, per-user, never a stored column (docs/domain-model.md). */
  tutosPick?: boolean;
  index?: number;
}

function formatMinutes(minutes: number) {
  return `${Math.round(minutes)} min read`;
}

/**
 * Two tiers only: the real thumbnail, shown only if its host is
 * allowlisted (next/image THROWS a render exception for an unlisted host
 * before any <img> element — and therefore any onError — exists, so this
 * has to be checked up front, not caught after the fact) and hasn't
 * failed to load at runtime; otherwise the branded cover
 * (BrandedCoverFallback), which uses a real bundled local Tuto asset and
 * so cannot itself fail the way a remote category-guessed photo could —
 * no further "failed" tier is needed under it. Same aspect-square
 * container either way, so layout never shifts.
 */
function useThumbnailState(thumbnailUrl: string) {
  const [tier, setTier] = useState<"primary" | "fallback">(() => (isAllowedImageHost(thumbnailUrl) ? "primary" : "fallback"));

  function handleError() {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[thumbnail] failed to load, using branded cover instead:`, thumbnailUrl);
    }
    setTier("fallback");
  }

  return { tier, handleError };
}

/**
 * Article tile for Explore's grid — mirrors PodcastCard exactly, including
 * its destination: the Article Learning Session (/article/[id]/learn),
 * not the original external source. Reading/Live Dictionary/Summary/
 * Vocabulary/Flashcards/Quiz/Reflection/Complete all happen in-app now.
 */
export function ArticleCard({ article, tutosPick = false, index = 0 }: ArticleCardProps) {
  const thumbnail = useThumbnailState(article.thumbnailUrl);

  return (
    <Link href={`/article/${article.id}/learn`} className="group block">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1], delay: index * 0.06 }}
        className="overflow-hidden rounded-2xl border border-border bg-bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
      >
        <div className="relative aspect-square overflow-hidden">
          {thumbnail.tier === "fallback" ? (
            <BrandedCoverFallback contentType="article" />
          ) : (
            <Image
              src={article.thumbnailUrl}
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
            {formatCefrRange(article.cefrLevelMin, article.cefrLevelMax)}
          </span>
        </div>
        <div className="p-4">
          {article.tags[0] && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{article.tags[0]}</p>
          )}
          <h4 className="mt-1 line-clamp-2 font-bold leading-snug text-text-primary">{article.title}</h4>
          <div className="mt-2 flex items-center gap-1 text-xs text-text-tertiary">
            <Clock className="h-3 w-3" />
            {formatMinutes(article.readingTimeMinutes)}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
