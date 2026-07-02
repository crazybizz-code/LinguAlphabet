import { getInitialData } from '../src/data.js';
import { newBbcPodcasts } from '../src/generated/newBbcLessons.js';

const data = getInitialData();
const failures = [];
const report = [];

function fail(id, message) {
  failures.push(`${id}: ${message}`);
}

function wordCount(text) {
  return text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
}

for (const podcast of newBbcPodcasts) {
  const transcript = data.transcripts[podcast.transcriptId];
  const row = {
    podcastId: podcast.podcastId,
    title: podcast.title,
    segments: transcript?.content?.length || 0,
    coverage: transcript?.alignment?.tokenCoverage ?? null,
    duration: transcript?.duration || 0
  };
  report.push(row);

  if (!podcast.podcastId || !podcast.transcriptId || !podcast.audioUrl || !podcast.title) {
    fail(podcast.podcastId || podcast.title, 'missing required podcast metadata');
  }
  if (!podcast.category || !podcast.series || !podcast.difficulty || !podcast.cefrLevel) {
    fail(podcast.podcastId, 'missing recommendation metadata');
  }
  if (!Array.isArray(podcast.targetGoals) || podcast.targetGoals.length === 0) {
    fail(podcast.podcastId, 'missing targetGoals for Learning Brain');
  }
  if (!Array.isArray(podcast.keywords) || podcast.keywords.length < 4) {
    fail(podcast.podcastId, 'not enough keywords for Explore/Search');
  }
  if (!Array.isArray(podcast.grammarTopics) || podcast.grammarTopics.length < 2) {
    fail(podcast.podcastId, 'not enough grammar topics');
  }
  if (!Array.isArray(podcast.grammarSentences) || podcast.grammarSentences.some(item => !item.topic || !item.sentence || !item.explanation)) {
    fail(podcast.podcastId, 'invalid grammar in context');
  }
  if (!Array.isArray(podcast.flashcards) || podcast.flashcards.length < 6) {
    fail(podcast.podcastId, 'not enough flashcards');
  }
  if (podcast.flashcards?.some(card => !card.word || !card.definition || !card.translation || !card.example)) {
    fail(podcast.podcastId, 'invalid flashcard content');
  }
  if (!Array.isArray(podcast.quizQuestions) || podcast.quizQuestions.length < 4) {
    fail(podcast.podcastId, 'not enough quiz questions');
  }
  if (podcast.quizQuestions?.some(q => !q.question || !Array.isArray(q.options) || q.options.length < 2 || !Number.isInteger(q.correct) || !q.explanation)) {
    fail(podcast.podcastId, 'invalid quiz content');
  }
  if (!transcript) {
    fail(podcast.podcastId, 'missing transcript');
    continue;
  }
  if (transcript.timing !== 'forced-aligned-from-audio') {
    fail(podcast.podcastId, `transcript is not forced aligned (${transcript.timing})`);
  }
  if ((transcript.alignment?.tokenCoverage || 0) < 0.82) {
    fail(podcast.podcastId, `low token coverage ${transcript.alignment?.tokenCoverage}`);
  }
  if (transcript.alignment?.missingSegments !== 0) {
    fail(podcast.podcastId, `missing aligned segments ${transcript.alignment?.missingSegments}`);
  }
  if (!Number.isFinite(transcript.duration) || transcript.duration <= 60000) {
    fail(podcast.podcastId, 'invalid transcript duration');
  }
  if (!Array.isArray(transcript.content) || transcript.content.length < 16) {
    fail(podcast.podcastId, 'too few transcript segments');
  }

  let previousEnd = 0;
  for (const [index, segment] of transcript.content.entries()) {
    if (!segment.speaker || !segment.text || wordCount(segment.text) === 0) {
      fail(podcast.podcastId, `invalid transcript segment ${index}`);
      break;
    }
    if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.endMs <= segment.startMs) {
      fail(podcast.podcastId, `invalid timestamp at segment ${index}`);
      break;
    }
    if (segment.startMs < previousEnd - 1500) {
      fail(podcast.podcastId, `non-monotonic timestamp at segment ${index}`);
      break;
    }
    previousEnd = segment.endMs;
  }
}

console.table(report);

if (failures.length) {
  console.error('\nFAIL');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('\nPASS');
