// ============================================================
// lessons.js — Transcript normalization + remote lesson CMS engine (no UI)
//
// Extracted from the old app orchestrator. Operates on an explicit
// `store` object ({ podcasts, transcripts }) instead of a global UI
// state, so it can be reused by whatever V2 mounts on top of it.
// ============================================================

const REMOTE_LESSON_CACHE_KEY = 'linguAlphabet_remote_lessons_v1';

export function normalizeTranscriptCollection(transcripts) {
  if (transcripts && typeof transcripts === 'object' && !Array.isArray(transcripts)) {
    return transcripts;
  }

  if (Array.isArray(transcripts)) {
    const normalized = {};
    transcripts.forEach(t => {
      if (t?.transcriptId) normalized[t.transcriptId] = t;
    });
    return normalized;
  }

  return {};
}

// Fills in missing segment timing (startMs/endMs) so downstream playback
// code always has a consistent shape to read from.
export function normalizeTranscript(transcript) {
  if (!transcript?.content?.length) return transcript;

  return {
    ...transcript,
    content: transcript.content.map((section, i) => {
      const startMs = section.startMs ?? section.timecodeMs ?? 0;
      const nextSection = transcript.content[i + 1];
      const endMs = section.endMs ?? section.timecodeMs_end ?? (
        nextSection
          ? (nextSection.startMs ?? nextSection.timecodeMs ?? startMs + 5000)
          : startMs + 5000
      );

      return {
        startMs,
        endMs,
        text: section.text,
        speaker: section.speaker || '',
        wordTimestamps: section.wordTimestamps || []
      };
    })
  };
}

export function normalizeRemotePodcast(row) {
  const podcast = row.podcast || row;
  const podcastId = row.podcast_id || podcast.podcastId || podcast.podcast_id;
  const transcriptId = row.transcript_id || podcast.transcriptId || podcast.transcript_id;
  if (!podcastId || !transcriptId || (!podcast.audioUrl && !podcast.audio_url)) return null;

  return {
    ...podcast,
    podcastId,
    transcriptId,
    title: podcast.title || 'Untitled lesson',
    description: podcast.description || '',
    language: podcast.language || 'English',
    source: podcast.source || 'LinguAlphabet',
    series: podcast.series || 'Remote Lessons',
    category: podcast.category || 'English',
    difficulty: podcast.difficulty || 'Intermediate',
    cefrLevel: podcast.cefrLevel || podcast.cefr_level || 'B1',
    duration: Number(podcast.duration) || 0,
    coverImage: podcast.coverImage || podcast.cover_image || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&q=80',
    audioUrl: podcast.audioUrl || podcast.audio_url,
    transcriptUrl: podcast.transcriptUrl || podcast.transcript_url || '',
    createdAt: podcast.createdAt || podcast.created_at || row.published_at || row.created_at || new Date().toISOString(),
    views: Number(podcast.views) || 0,
    averageRating: Number(podcast.averageRating || podcast.average_rating) || 4.8,
    skills: podcast.skills || ['Listening', 'Vocabulary'],
    keywords: podcast.keywords || [],
    flashcards: podcast.flashcards || [],
    quizQuestions: podcast.quizQuestions || podcast.quiz_questions || [],
    remoteManaged: true
  };
}

export function normalizeRemoteTranscript(row) {
  const transcript = row.transcript || row;
  const transcriptId = row.transcript_id || transcript.transcriptId || transcript.transcript_id;
  const podcastId = row.podcast_id || transcript.podcastId || transcript.podcast_id;
  const content = transcript.content || row.content;
  if (!transcriptId || !podcastId || !Array.isArray(content) || content.length === 0) return null;

  return {
    ...transcript,
    transcriptId,
    podcastId,
    language: transcript.language || 'English',
    duration: Number(transcript.duration) || 0,
    source: transcript.source || 'Remote transcript',
    timing: transcript.timing || 'forced-aligned-from-audio',
    alignment: transcript.alignment || { engine: 'external', tokenCoverage: null, missingSegments: 0 },
    content
  };
}

// Merges a { lessons, transcripts } bundle (from Supabase or the local
// cache) into `store.podcasts` / `store.transcripts`. Returns true if
// anything was merged.
export function mergeRemoteLessonBundle(store, bundle, { cache = false } = {}) {
  const remoteTranscripts = {};
  (bundle.transcripts || []).forEach(row => {
    const transcript = normalizeRemoteTranscript(row);
    if (transcript) remoteTranscripts[transcript.transcriptId] = transcript;
  });

  const remotePodcasts = (bundle.lessons || [])
    .map(normalizeRemotePodcast)
    .filter(podcast => podcast && remoteTranscripts[podcast.transcriptId]);

  if (!remotePodcasts.length) return false;

  store.transcripts = { ...store.transcripts, ...remoteTranscripts };

  const byId = new Map(store.podcasts.map(podcast => [podcast.podcastId, podcast]));
  remotePodcasts.forEach(podcast => byId.set(podcast.podcastId, podcast));
  store.podcasts = Array.from(byId.values());

  if (cache) {
    try {
      localStorage.setItem(REMOTE_LESSON_CACHE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        lessons: remotePodcasts.map(podcast => ({ podcast })),
        transcripts: Object.values(remoteTranscripts).map(transcript => ({ transcript }))
      }));
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Remote lesson cache skipped:', error.message);
    }
  }

  return true;
}

export function loadCachedRemoteLessons(store) {
  try {
    const cached = JSON.parse(localStorage.getItem(REMOTE_LESSON_CACHE_KEY) || 'null');
    if (cached?.lessons?.length && cached?.transcripts?.length) {
      mergeRemoteLessonBundle(store, cached);
    }
  } catch {
    localStorage.removeItem(REMOTE_LESSON_CACHE_KEY);
  }
}

export async function fetchAndMergeRemoteLessons(store, supabase) {
  const bundle = await supabase.getPublishedLessonBundle();
  return mergeRemoteLessonBundle(store, bundle, { cache: true });
}
