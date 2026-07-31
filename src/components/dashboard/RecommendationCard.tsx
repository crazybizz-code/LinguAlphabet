import Link from "next/link";
import { ArrowRight, BookOpen, Headphones } from "lucide-react";
import { missionHref } from "@/lib/learning-brain/strategies/todays-mission";
import type { ArticleContent, PodcastContent } from "@/types/content";

export interface RecommendationCardProps {
  item: PodcastContent | ArticleContent;
  /** Why this item, for this learner — built by buildRecommendationReason from the signal that actually decided the ranking. */
  reason: string;
}

/**
 * A Home recommendation, reduced to type, title and reason.
 *
 * Deliberately not PodcastCard/ArticleCard, which lead with cover art.
 * Cover-art grids are what made the old Home read as a content library;
 * Explore still uses them and should, but on Home the interesting
 * information is *why this was chosen*, and a 1:1 image pushes that below
 * the fold.
 */
export function RecommendationCard({ item, reason }: RecommendationCardProps) {
  const isArticle = item.contentType === "article";
  const Icon = isArticle ? BookOpen : Headphones;

  return (
    <Link
      href={missionHref(item)}
      className="group rounded-choice border border-border bg-bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-lighter">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
          {isArticle ? "Article" : "Podcast"}
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 text-sm font-bold text-text-primary">{item.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-text-tertiary">{reason}</p>

      <span className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary">
        Start
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </Link>
  );
}
