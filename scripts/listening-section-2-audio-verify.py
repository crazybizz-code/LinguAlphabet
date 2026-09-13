"""Independent audio QA for IELTS-style Listening Section 2.

Usage:
  python listening-section-2-audio-verify.py <audio.mp3> <assembly-manifest.json> <report.json>

The verifier is intentionally independent of synthesis. It reads the approved
content artifact, decodes the finished candidate through FFmpeg, runs local
faster-whisper ASR, and writes a machine-readable report. It never changes the
audio and makes no network or paid API call.
"""
from __future__ import annotations

import array
import difflib
import json
import math
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any


MIN_DURATION_SECONDS = 285.0
MAX_DURATION_SECONDS = 325.0
PAUSE_TOLERANCE_SECONDS = 0.25
MAX_UNPLANNED_SILENCE_SECONDS = 1.5
SILENCE_THRESHOLD_DBFS = -40.0
SAMPLE_RATE = 16_000
LOUDNESS_TARGET_LUFS = -16.0
LOUDNESS_TOLERANCE_LU = 1.0
MAX_TRUE_PEAK_DBTP = -1.0
MAX_CLICK_DELTA = 0.98

PRONUNCIATION_REVIEW = [
    {"term": "Maya Shah", "target": "MY-uh SHAH /ˈmaɪ.ə ʃɑː/"},
    {"term": "Millbrook", "target": "MILL-brook /ˈmɪl.brʊk/"},
    {"term": "café", "target": "CAF-ay"},
    {"term": "cloakroom", "target": "CLOKE-room"},
    {"term": "courtyard", "target": "clear first-syllable stress"},
    {"term": "pavilion", "target": "puh-VIL-yən"},
    {"term": "pottery", "target": "British pronunciation"},
    {"term": "eight / eighty", "target": "clearly distinguished"},
    {"term": "lead a sing-along", "target": "lead pronounced /liːd/"},
    {"term": "Studio One / Studio Two", "target": "numbers spoken as words"},
]

DIGIT_WORDS = {
    "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
    "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
    "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen",
    "15": "fifteen", "16": "sixteen", "17": "seventeen", "18": "eighteen",
    "19": "nineteen", "20": "twenty", "80": "eighty",
}

# These pairs represent spelling/token-boundary differences that preserve the
# approved spoken meaning. Keep this list explicit so genuine substitutions
# continue to fail evidence and fidelity checks.
TOKEN_BOUNDARY_EQUIVALENTS = {
    ("under", "cover"): "undercover",
    ("notice", "board"): "noticeboard",
}


def run(command: list[str], *, binary: bool = False) -> bytes | str:
    result = subprocess.run(command, check=True, capture_output=True)
    return result.stdout if binary else result.stdout.decode("utf-8", errors="replace")


def normalise_tokens(text: str) -> list[str]:
    value = unicodedata.normalize("NFKD", text.lower())
    value = value.replace("’", "'").replace("‘", "'").replace("—", " ").replace("–", " ")
    value = re.sub(r"[^a-z0-9' ]", " ", value)
    tokens: list[str] = []
    for token in value.split():
        if token.isdigit() and token in DIGIT_WORDS:
            tokens.extend(DIGIT_WORDS[token].split())
        else:
            tokens.append(token)
    canonical: list[str] = []
    index = 0
    while index < len(tokens):
        pair = tuple(tokens[index:index + 2])
        equivalent = TOKEN_BOUNDARY_EQUIVALENTS.get(pair)
        if equivalent is not None:
            canonical.append(equivalent)
            index += 2
        else:
            canonical.append(tokens[index])
            index += 1
    return canonical


def find_phrase(tokens: list[str], phrase: str, after: int = -1) -> int:
    wanted = normalise_tokens(phrase)
    for index in range(after + 1, len(tokens) - len(wanted) + 1):
        if tokens[index:index + len(wanted)] == wanted:
            return index
    return -1


def decode_pcm(audio_path: Path) -> array.array[int]:
    raw = run([
        "ffmpeg", "-v", "error", "-i", str(audio_path), "-f", "s16le",
        "-acodec", "pcm_s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-",
    ], binary=True)
    samples = array.array("h")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def rms_dbfs(samples: array.array[int], start: int, end: int) -> float:
    start = max(0, start)
    end = min(len(samples), end)
    if end <= start:
        return -120.0
    power = sum((samples[index] / 32768.0) ** 2 for index in range(start, end)) / (end - start)
    return 20.0 * math.log10(max(math.sqrt(power), 1e-6))


def silence_runs(samples: array.array[int]) -> list[dict[str, float]]:
    window_samples = int(SAMPLE_RATE * 0.02)
    quiet = []
    for start in range(0, len(samples), window_samples):
        quiet.append(rms_dbfs(samples, start, start + window_samples) <= SILENCE_THRESHOLD_DBFS)
    runs: list[dict[str, float]] = []
    start_window: int | None = None
    for index, is_quiet in enumerate(quiet + [False]):
        if is_quiet and start_window is None:
            start_window = index
        elif not is_quiet and start_window is not None:
            start_seconds = start_window * 0.02
            end_seconds = index * 0.02
            runs.append({
                "startSeconds": round(start_seconds, 3),
                "endSeconds": round(end_seconds, 3),
                "durationSeconds": round(end_seconds - start_seconds, 3),
            })
            start_window = None
    return runs


def overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def measure_loudness(audio_path: Path) -> dict[str, float | None]:
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(audio_path),
        "-af", "ebur128=peak=true", "-f", "null", "-",
    ], check=True, capture_output=True, text=True)
    report = result.stderr

    def last(pattern: str) -> float | None:
        matches = re.findall(pattern, report)
        return float(matches[-1]) if matches else None

    return {
        "integratedLufs": last(r"I:\s*(-?[\d.]+) LUFS"),
        "loudnessRangeLu": last(r"LRA:\s*(-?[\d.]+) LU"),
        "truePeakDbtp": last(r"Peak:\s*(-?[\d.]+) dBFS"),
    }


def probe_duration(audio_path: Path) -> float:
    value = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(audio_path),
    ])
    return float(value.strip())


def repeated_extra_windows(source: list[str], heard: list[str], width: int = 10) -> list[str]:
    source_counts = Counter(tuple(source[index:index + width]) for index in range(len(source) - width + 1))
    heard_counts = Counter(tuple(heard[index:index + width]) for index in range(len(heard) - width + 1))
    extras = [" ".join(window) for window, count in heard_counts.items() if count > source_counts.get(window, 0) and count > 1]
    return extras[:10]


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: python listening-section-2-audio-verify.py <audio.mp3> <manifest.json> <report.json>", file=sys.stderr)
        return 2

    audio_path = Path(sys.argv[1])
    manifest_path = Path(sys.argv[2])
    report_path = Path(sys.argv[3])
    if not audio_path.exists():
        print(f"Missing candidate audio: {audio_path}", file=sys.stderr)
        return 2
    if not manifest_path.exists():
        print(f"Missing assembly manifest: {manifest_path}", file=sys.stderr)
        return 2

    content = json.loads(Path("content/listening-section-2/listening-section-2.json").read_text(encoding="utf-8"))
    internal_qa = json.loads(Path("content/listening-section-2/listening-section-2-internal-qa.json").read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    transcript = content["section"]["transcript"]
    spoken = re.sub(r"^MAYA:\s*", "", transcript.strip())
    source_tokens = normalise_tokens(spoken)

    findings: list[dict[str, str]] = []

    def add(check: str, severity: str, detail: str) -> None:
        findings.append({"check": check, "severity": severity, "detail": detail})

    duration = probe_duration(audio_path)
    if not MIN_DURATION_SECONDS <= duration <= MAX_DURATION_SECONDS:
        add("duration", "fail", f"{duration:.2f}s is outside the 285–325s gate.")
    else:
        add("duration", "info", f"{duration:.2f}s is inside the 285–325s gate.")

    samples = decode_pcm(audio_path)
    runs = silence_runs(samples)
    planned_pauses = manifest.get("plannedPauses", [])
    pause_checks = []
    for planned in planned_pauses:
        start = float(planned["startSeconds"])
        end = float(planned["endSeconds"])
        candidates = sorted(runs, key=lambda item: overlap(item["startSeconds"], item["endSeconds"], start, end), reverse=True)
        detected = candidates[0] if candidates and overlap(candidates[0]["startSeconds"], candidates[0]["endSeconds"], start, end) > 0 else None
        placement_ok = bool(detected) and abs(detected["startSeconds"] - start) <= PAUSE_TOLERANCE_SECONDS and abs(detected["endSeconds"] - end) <= PAUSE_TOLERANCE_SECONDS
        pause_checks.append({"planned": planned, "detected": detected, "withinTolerance": placement_ok})
        if not placement_ok:
            add("pause-placement", "fail", f"{planned['id']} was not detected within ±{PAUSE_TOLERANCE_SECONDS:.2f}s.")

    unexplained = []
    for detected in runs:
        if detected["durationSeconds"] <= MAX_UNPLANNED_SILENCE_SECONDS:
            continue
        covered = any(overlap(detected["startSeconds"], detected["endSeconds"], float(planned["startSeconds"]), float(planned["endSeconds"])) >= min(1.0, detected["durationSeconds"] * 0.5) for planned in planned_pauses)
        if not covered:
            unexplained.append(detected)
    if unexplained:
        add("internal-silence", "fail", f"Found {len(unexplained)} unexplained silence run(s) longer than 1.5s.")
    else:
        add("internal-silence", "info", "No unexplained internal silence exceeds 1.5s.")

    clipped_samples = sum(1 for sample in samples if abs(sample) >= 32760)
    maximum_delta = max((abs(samples[index] - samples[index - 1]) / 65535.0 for index in range(1, len(samples))), default=0.0)
    click_candidates = sum(1 for index in range(1, len(samples)) if abs(samples[index] - samples[index - 1]) / 65535.0 > MAX_CLICK_DELTA)
    if clipped_samples:
        add("clipping", "fail", f"Found {clipped_samples} clipped sample(s).")
    if click_candidates:
        add("clicks", "fail", f"Found {click_candidates} sample discontinuity candidate(s); maximum delta {maximum_delta:.4f}.")
    else:
        add("clicks", "info", f"No extreme sample discontinuities; maximum delta {maximum_delta:.4f}.")

    loudness = measure_loudness(audio_path)
    integrated = loudness["integratedLufs"]
    true_peak = loudness["truePeakDbtp"]
    if integrated is None or abs(integrated - LOUDNESS_TARGET_LUFS) > LOUDNESS_TOLERANCE_LU:
        add("loudness", "fail", f"Integrated loudness {integrated} LUFS is not within ±1 LU of -16 LUFS.")
    if true_peak is None or true_peak > MAX_TRUE_PEAK_DBTP:
        add("true-peak", "fail", f"True peak {true_peak} dBTP exceeds the -1 dBTP ceiling.")

    from faster_whisper import WhisperModel

    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(audio_path), language="en", vad_filter=False, beam_size=5, word_timestamps=True)
    segments = list(segments)
    asr_text = " ".join(segment.text.strip() for segment in segments)
    heard_tokens = normalise_tokens(asr_text)
    matcher = difflib.SequenceMatcher(a=source_tokens, b=heard_tokens, autojunk=False)
    fidelity = matcher.ratio()
    opcodes = [
        {"operation": tag, "source": " ".join(source_tokens[i1:i2]), "heard": " ".join(heard_tokens[j1:j2])}
        for tag, i1, i2, j1, j2 in matcher.get_opcodes() if tag != "equal"
    ]
    if fidelity < 0.97:
        add("asr-fidelity", "fail", f"Token-sequence fidelity {fidelity:.4f} is below 0.9700.")
    else:
        add("asr-fidelity", "info", f"Token-sequence fidelity is {fidelity:.4f}.")

    answer_checks = []
    answer_cursor = -1
    answer_order_ok = True
    for item in sorted(internal_qa["items"], key=lambda record: record["q"]):
        position = find_phrase(heard_tokens, item["evidence"], answer_cursor)
        heard_exactly = position >= 0
        if not heard_exactly:
            answer_order_ok = False
            add("answer-evidence", "fail", f"Q{item['q']} evidence was missing or substituted in ASR.")
        else:
            answer_cursor = position
        answer_checks.append({"q": item["q"], "evidence": item["evidence"], "heardExactly": heard_exactly, "tokenIndex": position})
    if not answer_order_ok:
        add("answer-order", "fail", "Q11–Q20 evidence was not recovered exactly in strict order.")
    else:
        add("answer-order", "info", "Q11–Q20 evidence was recovered exactly in strict order.")

    distractor_checks = []
    for item in sorted(internal_qa["items"], key=lambda record: record["q"]):
        for evidence in item.get("distractorEvidence", []):
            position = find_phrase(heard_tokens, evidence)
            audible = position >= 0
            distractor_checks.append({"q": item["q"], "evidence": evidence, "audible": audible, "tokenIndex": position})
            if not audible:
                add("distractor-audibility", "fail", f"Q{item['q']} distractor evidence was missing or substituted in ASR: {evidence}")

    choir_position = find_phrase(heard_tokens, "the community choir will lead a sing-along in the courtyard")
    sports_position = find_phrase(heard_tokens, "we'll move into the sports hall", choir_position)
    forecast_position = find_phrase(heard_tokens, "the forecast is dry", sports_position)
    final_courtyard_position = find_phrase(heard_tokens, "the courtyard is the planned location", forecast_position)
    q20_order_ok = min(choir_position, sports_position, forecast_position, final_courtyard_position) >= 0 and choir_position < sports_position < forecast_position < final_courtyard_position
    if not q20_order_ok:
        add("q20-contrast", "fail", "ASR did not preserve courtyard → conditional sports hall → dry forecast → final courtyard order.")
    else:
        add("q20-contrast", "info", "Q20 conditional backup and final courtyard confirmation occur in the required order; prosodic subordination still needs human review.")

    duplicated_windows = repeated_extra_windows(source_tokens, heard_tokens)
    if duplicated_windows:
        add("duplicate-joins", "fail", f"ASR contains repeated 10-word windows absent from the source: {duplicated_windows}")
    else:
        add("duplicate-joins", "info", "No duplicated 10-word joins were detected.")

    add("pronunciation", "manual", "Human review is required for all pronunciation-sensitive terms and for Q20 prosody.")
    failures = [finding for finding in findings if finding["severity"] == "fail"]
    report: dict[str, Any] = {
        "valid": not failures,
        "audioFile": str(audio_path).replace("\\", "/"),
        "asrModel": "faster-whisper base.en (CPU int8)",
        "audioDurationSeconds": round(duration, 3),
        "asrReportedDurationSeconds": round(info.duration, 3),
        "sourceTokens": len(source_tokens),
        "heardTokens": len(heard_tokens),
        "asrFidelity": round(fidelity, 6),
        "asrDifferences": opcodes,
        "answerEvidence": answer_checks,
        "answersHeardExactlyInOrder": answer_order_ok,
        "distractors": distractor_checks,
        "pauseChecks": pause_checks,
        "unexplainedLongSilences": unexplained,
        "signal": {
            "clippedSamples": clipped_samples,
            "maximumAdjacentSampleDelta": round(maximum_delta, 6),
            "clickCandidates": click_candidates,
            **loudness,
        },
        "q20": {
            "requiredOrderRecovered": q20_order_ok,
            "manualReview": "Confirm that sports hall sounds conditional and that the final courtyard confirmation carries the decisive falling cadence.",
        },
        "pronunciationReview": [{**item, "status": "manual-review-required"} for item in PRONUNCIATION_REVIEW],
        "findings": findings,
        "failureCount": len(failures),
        "verdict": "PASS (machine checks) — awaiting human listening" if not failures else "FAIL",
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"duration: {duration:.2f}s")
    print(f"ASR fidelity: {fidelity:.4f}")
    print(f"answers in order: {answer_order_ok}")
    print(f"pause checks: {sum(1 for item in pause_checks if item['withinTolerance'])}/{len(pause_checks)}")
    print(f"failures: {len(failures)}")
    print(f"report: {report_path}")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
