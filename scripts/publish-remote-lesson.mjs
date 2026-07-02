import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: npm run publish:lesson -- path/to/lesson.json');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${supabaseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || data?.details || text || 'Supabase request failed');
  }
  return data;
}

function normalizeSegment(segment) {
  return {
    speaker: segment.speaker || 'Speaker',
    text: segment.text || '',
    startMs: Number(segment.startMs),
    endMs: Number(segment.endMs)
  };
}

const absoluteInputPath = path.resolve(inputPath);
const payload = JSON.parse(await readFile(absoluteInputPath, 'utf8'));
const podcast = payload.podcast;
const transcript = payload.transcript;

assert(podcast, 'Missing podcast object.');
assert(transcript, 'Missing transcript object.');
assert(podcast.podcastId, 'Missing podcast.podcastId.');
assert(podcast.audioUrl, 'Missing podcast.audioUrl.');
assert(podcast.transcriptId, 'Missing podcast.transcriptId.');
assert(transcript.transcriptId, 'Missing transcript.transcriptId.');
assert(transcript.podcastId, 'Missing transcript.podcastId.');
assert(podcast.transcriptId === transcript.transcriptId, 'podcast.transcriptId must match transcript.transcriptId.');
assert(podcast.podcastId === transcript.podcastId, 'podcast.podcastId must match transcript.podcastId.');
assert(Array.isArray(transcript.content) && transcript.content.length > 0, 'transcript.content must contain aligned segments.');

const content = transcript.content.map(normalizeSegment);
const badSegment = content.find(segment => (
  !segment.text ||
  !Number.isFinite(segment.startMs) ||
  !Number.isFinite(segment.endMs) ||
  segment.endMs <= segment.startMs
));
assert(!badSegment, 'Every transcript segment must have text, finite startMs, and endMs > startMs.');

const isPublished = payload.isPublished ?? true;
const now = new Date().toISOString();

const transcriptRow = {
  transcript_id: transcript.transcriptId,
  podcast_id: transcript.podcastId,
  is_published: isPublished,
  duration: Number(transcript.duration) || content.at(-1).endMs,
  transcript: {
    ...transcript,
    duration: Number(transcript.duration) || content.at(-1).endMs,
    content
  },
  updated_at: now
};

const lessonRow = {
  podcast_id: podcast.podcastId,
  transcript_id: podcast.transcriptId,
  is_published: isPublished,
  sort_order: Number(payload.sortOrder ?? podcast.sortOrder ?? 100),
  published_at: payload.publishedAt || podcast.publishedAt || now,
  podcast: {
    ...podcast,
    transcriptId: podcast.transcriptId,
    podcastId: podcast.podcastId
  },
  updated_at: now
};

await request('/rest/v1/published_transcripts?on_conflict=transcript_id', {
  method: 'POST',
  body: JSON.stringify(transcriptRow)
});

await request('/rest/v1/published_lessons?on_conflict=podcast_id', {
  method: 'POST',
  body: JSON.stringify(lessonRow)
});

console.log(`Published ${podcast.podcastId} (${content.length} transcript segments).`);
