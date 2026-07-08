"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  FileText,
  Headphones,
  MessagesSquare,
  Newspaper,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Video,
  X,
} from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { TutoNoteCard } from "@/components/mascot/TutoNoteCard";
import { PodcastCard } from "@/components/content/PodcastCard";
import { searchService } from "@/lib/content/search";
import { CEFR_ORDER } from "@/lib/learning-brain/cefr";
import type { PodcastContent } from "@/types/content";

interface KnowledgeHubTab {
  id: string;
  label: string;
  icon: LucideIcon;
  available: boolean;
}

const KNOWLEDGE_HUB_TABS: KnowledgeHubTab[] = [
  { id: "podcasts", label: "Podcasts", icon: Headphones, available: true },
  { id: "articles", label: "Articles", icon: FileText, available: false },
  { id: "news", label: "News", icon: Newspaper, available: false },
  { id: "videos", label: "Videos", icon: Video, available: false },
  { id: "stories", label: "Stories", icon: BookOpen, available: false },
  { id: "conversations", label: "Conversations", icon: MessagesSquare, available: false },
  { id: "challenges", label: "Challenges", icon: Trophy, available: false },
];

export interface ExploreViewProps {
  podcasts: PodcastContent[];
  tutoRecommends: PodcastContent[];
}

export function ExploreView({ podcasts, tutoRecommends }: ExploreViewProps) {
  const [activeTab, setActiveTab] = useState("podcasts");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [notified, setNotified] = useState<Record<string, boolean>>({});

  const availableTopics = useMemo(
    () => Array.from(new Set(podcasts.flatMap((podcast) => podcast.topics))).sort(),
    [podcasts],
  );

  // Universal Search is async (searchService.rank returns a Promise) so a
  // future AI-powered ranker is a drop-in here — today's deterministic
  // ranker resolves in the same tick, but the seam is already real.
  const [searchResults, setSearchResults] = useState<PodcastContent[]>(podcasts);

  useEffect(() => {
    let cancelled = false;
    searchService.rank(podcasts, query).then((results) => {
      if (!cancelled) setSearchResults(results);
    });
    return () => {
      cancelled = true;
    };
  }, [podcasts, query]);

  const filtered = useMemo(() => {
    let result = searchResults;
    if (levelFilter) result = result.filter((podcast) => podcast.cefrLevelMin === levelFilter);
    if (topicFilter) result = result.filter((podcast) => podcast.topics.includes(topicFilter));
    return result;
  }, [searchResults, levelFilter, topicFilter]);

  const isBrowsing = query.trim() === "" && !levelFilter && !topicFilter;
  const activeChip = KNOWLEDGE_HUB_TABS.find((tab) => tab.id === activeTab);
  const hasActiveFilter = Boolean(levelFilter || topicFilter);

  return (
    <div className="mx-auto max-w-5xl px-5 pb-12 pt-8 sm:px-8 md:pt-10">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Explore</h1>
        <p className="mt-1.5 text-sm text-text-secondary sm:text-[15px]">
          Discover more content, curated by Tuto for your learning journey.
        </p>
      </motion.header>

      {/* Universal Search — always the first section (product decision). Field
          coverage is dispatched by content type (src/lib/content/search/extract.ts):
          title/description/topics/tags for every type today, plus transcript,
          vocabulary, and takeaways for podcasts. Article body, story text, video
          transcript, and conversation text each add their own case there when
          those types ship — this component never changes. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="relative mt-6"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search podcasts, topics, categories..."
          aria-label="Search the Knowledge Hub"
          className="w-full rounded-2xl border border-border bg-bg-muted py-3.5 pl-12 pr-11 text-sm font-medium text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary focus:bg-bg-card focus:outline-none focus:ring-4 focus:ring-focus-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </motion.div>

      {/* Knowledge Hub selector — every content type is visible from day one
          (docs/dashboard-architecture.md §10), only Podcasts is live. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        role="tablist"
        aria-label="Knowledge Hub content types"
        className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1"
      >
        {KNOWLEDGE_HUB_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive ? "bg-primary text-text-on-primary shadow-glow" : "bg-bg-muted text-text-secondary hover:bg-border/60"
              }`}
            >
              <tab.icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
              {!tab.available && (
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${isActive ? "text-white/70" : "text-text-tertiary"}`}
                >
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </motion.div>

      <AnimatePresence mode="wait">
        {activeChip?.available ? (
          <motion.div
            key="podcasts-panel"
            role="tabpanel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {/* Tuto Recommends — always shown first while just browsing (docs/dashboard-architecture.md §5),
                steps aside the moment the learner searches or filters with actual intent. */}
            {isBrowsing && tutoRecommends.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="mt-8"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-text-primary">Recommended by Tuto</h2>
                </div>
                <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
                  {tutoRecommends.map((podcast, index) => (
                    <PodcastCard key={podcast.id} podcast={podcast} tutosPick index={index} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Filters — secondary, collapsed by default, never the primary path. */}
            <div className="mt-8 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                All Podcasts <span className="text-text-tertiary">({filtered.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                aria-expanded={filtersOpen}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  hasActiveFilter ? "bg-primary-lighter text-primary" : "text-text-secondary hover:bg-bg-muted"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Filters
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {filtersOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-2xl border border-border bg-bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Level</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CEFR_ORDER.map((level) => (
                        <button
                          key={level}
                          type="button"
                          aria-pressed={levelFilter === level}
                          onClick={() => setLevelFilter((current) => (current === level ? null : level))}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                            levelFilter === level
                              ? "bg-primary text-text-on-primary"
                              : "bg-bg-card text-text-secondary hover:bg-border/60"
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>

                    {availableTopics.length > 0 && (
                      <>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Topic</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableTopics.map((topic) => (
                            <button
                              key={topic}
                              type="button"
                              aria-pressed={topicFilter === topic}
                              onClick={() => setTopicFilter((current) => (current === topic ? null : topic))}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                topicFilter === topic
                                  ? "bg-primary text-text-on-primary"
                                  : "bg-bg-card text-text-secondary hover:bg-border/60"
                              }`}
                            >
                              {topic}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {filtered.length > 0 ? (
              <div className="mt-4 grid grid-cols-4 gap-4 max-xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
                {filtered.map((podcast, index) => (
                  <PodcastCard key={podcast.id} podcast={podcast} index={index} />
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center rounded-[2rem] border border-border bg-bg-muted px-6 py-16 text-center">
                <Tuto pose="thinking" size="sm" />
                <p className="mt-4 text-lg font-semibold text-text-primary">
                  {query ? `No podcasts found for "${query}"` : "No podcasts match those filters"}
                </p>
                <p className="mt-1 max-w-sm text-sm text-text-tertiary">
                  Try a different search or clear a filter — Tuto is here to help you find what you need.
                </p>
              </div>
            )}
          </motion.div>
        ) : (
          activeChip && (
            <ComingSoonPanel
              key={activeChip.id}
              tab={activeChip}
              notified={Boolean(notified[activeChip.id])}
              onNotify={() => setNotified((current) => ({ ...current, [activeChip.id]: true }))}
            />
          )
        )}
      </AnimatePresence>
    </div>
  );
}

function ComingSoonPanel({
  tab,
  notified,
  onNotify,
}: {
  tab: KnowledgeHubTab;
  notified: boolean;
  onNotify: () => void;
}) {
  return (
    <motion.div
      role="tabpanel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="mt-8 flex flex-col items-center rounded-[2rem] border border-border bg-bg-muted px-6 py-16 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-bg-card shadow-sm">
        <tab.icon className="h-7 w-7 text-primary" aria-hidden="true" />
      </span>
      <h2 className="mt-6 text-xl font-bold text-text-primary">{tab.label} — Coming Soon</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-tertiary">
        Tuto is working on bringing you {tab.label.toLowerCase()} that will fit right into your learning journey.
      </p>

      <TutoNoteCard
        note={{
          pose: "happy",
          message: `I'm working on something special for ${tab.label.toLowerCase()}. Stay tuned — it'll be worth the wait!`,
        }}
        className="mt-8 max-w-md text-left"
      />

      <button
        type="button"
        onClick={onNotify}
        disabled={notified}
        className="mt-6 rounded-2xl bg-text-primary px-6 py-3 text-sm font-semibold text-text-on-primary transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
      >
        {notified ? "We'll let you know!" : "Notify Me When Available"}
      </button>
    </motion.div>
  );
}
