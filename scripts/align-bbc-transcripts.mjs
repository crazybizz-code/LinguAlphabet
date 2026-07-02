import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getInitialData } from '../src/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.join(rootDir, '.cache', 'bbc-alignment');
const outputPath = path.join(rootDir, 'src', 'generated', 'bbcTranscripts.js');

const args = new Set(process.argv.slice(2));
const skipAsr = args.has('--skip-asr');
const strict = !args.has('--no-strict');
const onlyArg = process.argv.find(arg => arg.startsWith('--only='));
const onlyPodcastIds = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map(id => id.trim()).filter(Boolean))
  : null;

const WORD_RE = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

function normalizeToken(token) {
  return token
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
}

function tokenize(text) {
  return [...text.matchAll(WORD_RE)]
    .map(match => normalizeToken(match[0]))
    .filter(Boolean);
}

function flattenOfficialSegments(transcript) {
  const flattened = [];

  transcript.content.forEach((segment, segmentIndex) => {
    tokenize(segment.text).forEach(token => {
      flattened.push({
        token,
        segmentIndex
      });
    });
  });

  return flattened;
}

function loadWhisperWords(whisperJson) {
  const words = [];

  for (const segment of whisperJson.segments || []) {
    for (const word of segment.words || []) {
      if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) continue;
      const token = normalizeToken(String(word.word || word.text || ''));
      if (!token) continue;
      words.push({
        token,
        startMs: Math.round(word.start * 1000),
        endMs: Math.round(word.end * 1000)
      });
    }
  }

  return words;
}

function tokenScore(a, b) {
  if (a === b) return 3;
  if (a.length > 4 && b.length > 4 && (a.includes(b) || b.includes(a))) return 1;
  return -2;
}

function alignTokens(officialTokens, audioWords) {
  const n = officialTokens.length;
  const m = audioWords.length;
  const gapPenalty = -1;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  const trace = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));

  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] + gapPenalty;
    trace[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] + gapPenalty;
    trace[0][j] = 2;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diagonal = dp[i - 1][j - 1] + tokenScore(officialTokens[i - 1].token, audioWords[j - 1].token);
      const up = dp[i - 1][j] + gapPenalty;
      const left = dp[i][j - 1] + gapPenalty;
      if (diagonal >= up && diagonal >= left) {
        dp[i][j] = diagonal;
        trace[i][j] = 0;
      } else if (up >= left) {
        dp[i][j] = up;
        trace[i][j] = 1;
      } else {
        dp[i][j] = left;
        trace[i][j] = 2;
      }
    }
  }

  const matches = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = trace[i][j];
    if (i > 0 && j > 0 && move === 0) {
      if (tokenScore(officialTokens[i - 1].token, audioWords[j - 1].token) > 0) {
        matches.push({
          officialIndex: i - 1,
          audioIndex: j - 1
        });
      }
      i -= 1;
      j -= 1;
    } else if (i > 0 && (j === 0 || move === 1)) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return matches.reverse();
}

function buildAlignedSegments(transcript, audioWords) {
  const officialTokens = flattenOfficialSegments(transcript);
  const matches = alignTokens(officialTokens, audioWords);
  const perSegment = transcript.content.map(() => []);

  for (const match of matches) {
    const official = officialTokens[match.officialIndex];
    const audio = audioWords[match.audioIndex];
    perSegment[official.segmentIndex].push(audio);
  }

  const aligned = transcript.content.map((segment, index) => {
    const words = perSegment[index];
    if (!words.length) {
      return {
        speaker: segment.speaker,
        text: segment.text,
        startMs: null,
        endMs: null
      };
    }

    return {
      speaker: segment.speaker,
      text: segment.text,
      startMs: words[0].startMs,
      endMs: words[words.length - 1].endMs
    };
  });

  const audioDuration = audioWords.at(-1)?.endMs || transcript.duration || 0;
  const duration = Math.max(Number(transcript.duration) || 0, audioDuration);
  fillSmallAlignmentGaps(aligned, duration);

  const alignedTokenCount = perSegment.reduce((sum, words) => sum + words.length, 0);
  const coverage = officialTokens.length ? alignedTokenCount / officialTokens.length : 0;
  const missingSegments = aligned.filter(segment => segment.startMs === null || segment.endMs === null).length;

  return {
    transcriptId: transcript.transcriptId,
    podcastId: transcript.podcastId,
    language: transcript.language,
    duration,
    source: transcript.source,
    timing: 'forced-aligned-from-audio',
    alignment: {
      engine: process.env.ALIGNMENT_ENGINE || 'faster-whisper',
      tokenCoverage: Number(coverage.toFixed(4)),
      missingSegments
    },
    content: aligned.map(segment => ({
      speaker: segment.speaker,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs
    }))
  };
}

function fillSmallAlignmentGaps(segments, durationMs) {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.startMs !== null && segment.endMs !== null) continue;

    const previous = [...segments.slice(0, index)].reverse().find(s => s.endMs !== null);
    const next = segments.slice(index + 1).find(s => s.startMs !== null);

    if (!previous || !next) continue;

    const gapStart = previous.endMs;
    const gapEnd = next.startMs;
    const gapSegments = [];
    for (let cursor = index; cursor < segments.length; cursor += 1) {
      if (segments[cursor].startMs !== null) break;
      gapSegments.push(segments[cursor]);
    }

    const gapTextLengths = gapSegments.map(s => Math.max(1, tokenize(s.text).length));
    const total = gapTextLengths.reduce((sum, value) => sum + value, 0);
    let offset = gapStart;

    gapSegments.forEach((missing, missingIndex) => {
      const share = gapTextLengths[missingIndex] / total;
      const end = missingIndex === gapSegments.length - 1
        ? gapEnd
        : Math.round(offset + (gapEnd - gapStart) * share);
      missing.startMs = offset;
      missing.endMs = Math.max(offset + 1, end);
      offset = missing.endMs;
    });
  }

  for (const segment of segments) {
    if (segment.startMs === null || segment.endMs === null) {
      throw new Error(`Unable to align segment: "${segment.text.slice(0, 80)}"`);
    }
    segment.startMs = Math.max(0, Math.min(durationMs, segment.startMs));
    segment.endMs = Math.max(segment.startMs + 1, Math.min(durationMs, segment.endMs));
  }
}

async function downloadFile(url, destination) {
  if (existsSync(destination)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
}

function runWordTimestampEngine(audioPath, outputJsonPath, outputDir) {
  const engine = process.env.ALIGNMENT_ENGINE || 'faster-whisper';
  if (engine === 'whisperx') {
    runWhisperX(audioPath, outputDir);
    return;
  }
  if (engine === 'whisper-timestamped') {
    runWhisperTimestamped(audioPath, outputJsonPath);
    return;
  }

  runFasterWhisper(audioPath, outputJsonPath);
}

function runWhisperTimestamped(audioPath, outputJsonPath) {
  const pythonPath = process.env.WHISPERX_PYTHON || 'python';
  const result = spawnSync(pythonPath, [
    path.join(rootDir, 'scripts', 'whisper-timestamped-words.py'),
    audioPath,
    '--model',
    process.env.WHISPER_TIMESTAMPED_MODEL || 'base.en',
    '--output',
    outputJsonPath
  ], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`whisper-timestamped word timestamp generation failed. status=${result.status} signal=${result.signal || 'none'}`);
  }
}

function runFasterWhisper(audioPath, outputJsonPath) {
  const pythonPath = process.env.WHISPERX_PYTHON || 'python';
  const result = spawnSync(pythonPath, [
    path.join(rootDir, 'scripts', 'faster-whisper-words.py'),
    audioPath,
    '--model',
    process.env.FASTER_WHISPER_MODEL || 'medium.en',
    '--output',
    outputJsonPath,
    '--device',
    process.env.FASTER_WHISPER_DEVICE || 'cpu',
    '--compute-type',
    process.env.FASTER_WHISPER_COMPUTE_TYPE || 'int8'
  ], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`faster-whisper word timestamp generation failed. status=${result.status} signal=${result.signal || 'none'}`);
  }
}

function runWhisperX(audioPath, outputDir) {
  const pythonPath = process.env.WHISPERX_PYTHON || 'python';
  const result = spawnSync(pythonPath, [
    '-m',
    'whisperx',
    audioPath,
    '--model',
    'large-v3',
    '--language',
    'en',
    '--output_dir',
    outputDir,
    '--output_format',
    'json',
    '--compute_type',
    'int8'
  ], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`WhisperX failed. status=${result.status} signal=${result.signal || 'none'}`);
  }
}

async function alignPodcast(podcast) {
  const sourceData = getInitialData();
  const transcript = sourceData.transcripts[podcast.transcriptId];
  const podcastDir = path.join(cacheDir, podcast.podcastId);
  const audioPath = path.join(podcastDir, `${podcast.podcastId}.mp3`);
  const whisperJsonPath = path.join(podcastDir, `${podcast.podcastId}.json`);

  await mkdir(podcastDir, { recursive: true });
  await downloadFile(podcast.audioUrl, audioPath);

  if (!skipAsr && !existsSync(whisperJsonPath)) {
    runWordTimestampEngine(audioPath, whisperJsonPath, podcastDir);
  }

  const whisperJson = JSON.parse(await readFile(whisperJsonPath, 'utf8'));
  const audioWords = loadWhisperWords(whisperJson);
  if (!audioWords.length) throw new Error(`No word timestamps found for ${podcast.podcastId}`);

  const aligned = buildAlignedSegments(transcript, audioWords);
  if (strict && (aligned.alignment.tokenCoverage < 0.82 || aligned.alignment.missingSegments > 0)) {
    throw new Error(
      `${podcast.podcastId} alignment failed quality gate: coverage=${aligned.alignment.tokenCoverage}, missingSegments=${aligned.alignment.missingSegments}`
    );
  }

  return aligned;
}

function serializeGeneratedModule(transcripts) {
  return `// Generated by scripts/align-bbc-transcripts.mjs.\n` +
    `// Do not edit manually. Re-run npm run align:bbc after transcript/audio changes.\n\n` +
    `export const bbcTranscripts = ${JSON.stringify(transcripts, null, 2)};\n`;
}

async function main() {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const sourceData = getInitialData();
  const transcripts = JSON.parse(JSON.stringify(sourceData.transcripts));

  for (const podcast of sourceData.podcasts) {
    if (onlyPodcastIds && !onlyPodcastIds.has(podcast.podcastId)) continue;
    if (!podcast.transcriptId || !sourceData.transcripts[podcast.transcriptId]) continue;
    console.log(`Aligning ${podcast.podcastId}...`);
    transcripts[podcast.transcriptId] = await alignPodcast(podcast);
  }

  await writeFile(outputPath, serializeGeneratedModule(transcripts), 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
