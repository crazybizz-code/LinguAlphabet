import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getArticleById, getPodcastById } from "@/lib/content/queries";
import { extractParagraphs } from "@/lib/learning-session/adapters/article";

export interface AIArticleSummary {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  readingTimeMinutes: number;
  topics: string[];
}

export interface AIPodcastSummary {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  durationSeconds: number;
  topics: string[];
}

export interface AITranscriptSegment {
  speaker: string;
  text: string;
  timestampSeconds: number;
}

export interface AIQuizQuestion {
  type: "mc" | "tf" | "fill";
  prompt: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string;
}

export interface AIQuiz {
  contentId: string;
  title: string;
  cefrLevel: string;
  questions: AIQuizQuestion[];
}

/**
 * The AI system's one window onto real learning content. Every tool that
 * needs to read "the article/podcast/quiz the learner is currently on"
 * (src/ai/tools/definitions/get-current-article.ts and its siblings)
 * depends on this interface, never on Supabase or @/lib/content directly —
 * same shape-independence rule as everywhere else in src/ai: callers see
 * only these AI-owned types, never the app's ArticleContent/PodcastContent.
 *
 * This is the first of what should become several sibling repositories
 * under src/ai/data/ as real consumers need them — a LearnerRepository
 * (profile, mistake history), a ProgressRepository (completion/streak
 * state), a VocabularyRepository (curated word lookups), a
 * MissionRepository (Today's Mission) — each its own
 * `<domain>-repository.ts` exporting an interface plus a Supabase-backed
 * factory, following this file's shape. Deliberately not pre-built here:
 * this codebase already has three examples of exactly that
 * scaffolding-before-a-real-caller pattern sitting unused for many sprints
 * (src/ai/memory's MemoryStore, src/ai/actions's ActionDefinition,
 * src/ai/learner's LearnerProfile — see docs/ai-coach-audit.md). The
 * convention is the reusable part; the next repository gets written when
 * something real needs to call it, not before.
 */
export interface ContentRepository {
  getArticle(id: string): Promise<AIArticleSummary | null>;
  getArticleParagraphs(id: string, maxParagraphs?: number): Promise<string[] | null>;
  getPodcast(id: string): Promise<AIPodcastSummary | null>;
  getPodcastTranscript(id: string, maxSegments?: number): Promise<AITranscriptSegment[] | null>;
  /**
   * `contentType` is required because a quiz isn't its own entity in the
   * real data model — it's an enrichment attachment on whichever
   * article_details/podcast_details row `id` points at
   * (docs/domain-model.md's "universal enrichment attachments"), not a
   * standalone table with its own id.
   */
  getQuiz(contentType: "article" | "podcast", id: string): Promise<AIQuiz | null>;
}

class SupabaseContentRepository implements ContentRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getArticle(id: string): Promise<AIArticleSummary | null> {
    const article = await getArticleById(this.supabase, id);
    if (!article) return null;
    return {
      id: article.id,
      title: article.title,
      description: article.description,
      cefrLevel: article.cefrLevelMin,
      readingTimeMinutes: article.readingTimeMinutes,
      topics: article.topics,
    };
  }

  async getArticleParagraphs(id: string, maxParagraphs?: number): Promise<string[] | null> {
    const article = await getArticleById(this.supabase, id);
    if (!article) return null;
    const paragraphs = extractParagraphs(article.body);
    return maxParagraphs ? paragraphs.slice(0, maxParagraphs) : paragraphs;
  }

  async getPodcast(id: string): Promise<AIPodcastSummary | null> {
    const podcast = await getPodcastById(this.supabase, id);
    if (!podcast) return null;
    return {
      id: podcast.id,
      title: podcast.title,
      description: podcast.description,
      cefrLevel: podcast.cefrLevelMin,
      durationSeconds: podcast.durationSeconds,
      topics: podcast.topics,
    };
  }

  async getPodcastTranscript(id: string, maxSegments?: number): Promise<AITranscriptSegment[] | null> {
    const podcast = await getPodcastById(this.supabase, id);
    if (!podcast) return null;
    const segments = podcast.transcript.map((segment) => ({
      speaker: segment.speaker,
      text: segment.text,
      timestampSeconds: Math.round(segment.startMs / 1000),
    }));
    return maxSegments ? segments.slice(0, maxSegments) : segments;
  }

  async getQuiz(contentType: "article" | "podcast", id: string): Promise<AIQuiz | null> {
    const content = contentType === "article" ? await getArticleById(this.supabase, id) : await getPodcastById(this.supabase, id);
    if (!content || content.quiz.length === 0) return null;

    return {
      contentId: content.id,
      title: content.title,
      cefrLevel: content.cefrLevelMin,
      questions: content.quiz.map((question) => ({
        type: question.type,
        prompt: question.question,
        choices: question.options,
        correctChoiceIndex: question.correct,
        explanation: question.explanation,
      })),
    };
  }
}

/** The only place a caller should ever construct a ContentRepository — swaps to a different backing store later without any tool/service call site changing. */
export function createContentRepository(supabase: SupabaseClient<Database>): ContentRepository {
  return new SupabaseContentRepository(supabase);
}
