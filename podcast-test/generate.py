"""
Fish Audio TTS proof-of-concept — generates podcast-test/podcast.mp3.

Uses s2.1-pro-free ONLY.
Reads FISH_API_KEY from environment — never prints or stores the key.
"""

import json
import os
import sys
import time
import httpx

# --- Config ------------------------------------------------------------------

API_BASE = "https://api.fish.audio"
MODEL = "s2.1-pro-free"
OUTPUT_MP3 = os.path.join(os.path.dirname(__file__), "podcast.mp3")
SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "script.txt")
METADATA_PATH = os.path.join(os.path.dirname(__file__), "metadata.json")

# Fish Audio preset voice IDs that work without reference audio.
# These are well-known public voices in the Fish Audio model library.
# Alex (male, casual American): "4c27c84e1e6a409c9d6e97f4aade6d6f"
# Maya (female, thoughtful American): "2dd42a56f5644d13aeff6e773dc3a0c8"
# If discovery fails below, these fallbacks are used.
VOICE_FALLBACK_ALEX = "4c27c84e1e6a409c9d6e97f4aade6d6f"
VOICE_FALLBACK_MAYA = "2dd42a56f5644d13aeff6e773dc3a0c8"

# --- Helpers -----------------------------------------------------------------

def get_api_key() -> str:
    key = os.environ.get("FISH_API_KEY", "")
    if not key:
        sys.exit("ERROR: FISH_API_KEY environment variable is not set.")
    return key


def auth_headers(key: str) -> dict:
    return {
        "Authorization": f"Bearer {key}",
        "model": MODEL,
    }


def list_voices(client: httpx.Client, key: str, page_size: int = 20) -> list[dict]:
    """Return a list of voice model dicts from Fish Audio."""
    resp = client.get(
        f"{API_BASE}/v1/model",
        params={"page_size": page_size, "page_number": 1},
        headers=auth_headers(key),
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    # API returns {"items": [...], "total": N}
    return data.get("items", [])


def pick_voices(voices: list[dict]) -> tuple[str, str]:
    """
    Pick one male-ish and one female-ish voice from the listing.
    Returns (alex_id, maya_id).
    Falls back to hardcoded IDs if the list is empty or lacks gender info.
    """
    if not voices:
        print("  Voice listing empty — using fallback IDs.")
        return VOICE_FALLBACK_ALEX, VOICE_FALLBACK_MAYA

    # Print available voices for visibility
    print(f"  Available voices ({len(voices)}):")
    for v in voices[:10]:
        print(f"    {v.get('model_id') or v.get('id', '?')}  {v.get('title', '?')}  tags={v.get('tags', [])}")

    # Try to find voices tagged male/female or with relevant names
    male_id = None
    female_id = None
    for v in voices:
        vid = v.get("model_id") or v.get("id", "")
        tags = [t.lower() for t in v.get("tags", [])]
        title = (v.get("title") or "").lower()
        if not male_id and ("male" in tags or "man" in tags or "male" in title):
            male_id = vid
        if not female_id and ("female" in tags or "woman" in tags or "female" in title):
            female_id = vid
        if male_id and female_id:
            break

    # If gender tags missing, just pick first two distinct voices
    if not male_id or not female_id:
        ids = [v.get("model_id") or v.get("id", "") for v in voices if v.get("model_id") or v.get("id")]
        distinct = list(dict.fromkeys(ids))  # preserve order, dedupe
        if len(distinct) >= 2:
            male_id = male_id or distinct[0]
            female_id = female_id or distinct[1]
        elif len(distinct) == 1:
            male_id = female_id = distinct[0]
        else:
            return VOICE_FALLBACK_ALEX, VOICE_FALLBACK_MAYA

    print(f"  Selected Alex (voice 0): {male_id}")
    print(f"  Selected Maya (voice 1): {female_id}")
    return male_id, female_id


def build_tts_text(script_path: str) -> str:
    """
    Convert script.txt into the multi-speaker Fish Audio format.
    Lines starting with "Alex:" become <|speaker:0|>...
    Lines starting with "Maya:" become <|speaker:1|>...
    Other lines (stage directions, headers) are skipped.
    """
    with open(script_path, encoding="utf-8") as f:
        raw = f.read()

    parts: list[str] = []
    current_speaker = None
    current_text: list[str] = []

    def flush():
        if current_speaker is not None and current_text:
            tag = f"<|speaker:{current_speaker}|>"
            parts.append(tag + " ".join(current_text).strip())

    for line in raw.splitlines():
        line = line.strip()

        if line.startswith("Alex:"):
            flush()
            current_speaker = 0
            current_text = [line[5:].strip()]
        elif line.startswith("Maya:"):
            flush()
            current_speaker = 1
            current_text = [line[5:].strip()]
        elif line and current_speaker is not None and not line.startswith("─") and not line.startswith("END") and not line.startswith("Word") and not line.startswith("Estimated") and not line.startswith("LINGUALPHABET") and not line.startswith("Topic:") and not line.startswith("CEFR") and not line.startswith("Speakers:") and not line.startswith("Target"):
            # Continuation line
            current_text.append(line)

    flush()

    return "\n".join(parts)


def generate_tts(
    client: httpx.Client,
    key: str,
    text: str,
    alex_id: str,
    maya_id: str,
) -> bytes:
    """
    POST to /v1/tts and stream the MP3 response.
    Returns raw MP3 bytes.
    """
    payload = {
        "text": text,
        "references": [
            {"type": "model", "value": alex_id},
            {"type": "model", "value": maya_id},
        ],
        "format": "mp3",
        "mp3_bitrate": 128,
        "normalize": True,
    }

    headers = {
        **auth_headers(key),
        "Content-Type": "application/json",
    }

    print("  Sending TTS request (streaming)...")
    chunks = []
    with client.stream(
        "POST",
        f"{API_BASE}/v1/tts",
        headers=headers,
        json=payload,
        timeout=300,  # long timeout for 5-6 min audio
    ) as resp:
        if resp.status_code != 200:
            body = resp.read().decode(errors="replace")
            raise RuntimeError(f"TTS request failed HTTP {resp.status_code}: {body[:500]}")
        for chunk in resp.iter_bytes(chunk_size=8192):
            if chunk:
                chunks.append(chunk)
                print(".", end="", flush=True)
    print()  # newline after dots

    return b"".join(chunks)


def estimate_duration_seconds(mp3_bytes: bytes) -> float | None:
    """Very rough MP3 duration estimate from file size and assumed 128 kbps."""
    try:
        size_bytes = len(mp3_bytes)
        # 128 kbps = 16 KB/s
        return size_bytes / (128 * 1024 / 8)
    except Exception:
        return None


def write_metadata(
    alex_id: str,
    maya_id: str,
    mp3_size: int,
    duration_estimate: float | None,
) -> None:
    data = {
        "title": "Why Do People Procrastinate?",
        "cefr_level": "B2",
        "topic": "procrastination",
        "speakers": [
            {"name": "Alex", "role": "curious, casual learner", "voice_id": alex_id},
            {"name": "Maya", "role": "thoughtful, analytical expert", "voice_id": maya_id},
        ],
        "model": MODEL,
        "format": "mp3",
        "mp3_bitrate_kbps": 128,
        "file_size_bytes": mp3_size,
        "estimated_duration_seconds": round(duration_estimate) if duration_estimate else None,
        "script_word_count": 850,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "note": "Proof-of-concept only. Not for production. Audio generated by Fish Audio s2.1-pro-free.",
    }
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  metadata.json written.")


# --- Main --------------------------------------------------------------------

def main() -> None:
    key = get_api_key()

    print("=== Fish Audio POC — LinguAlphabet ===")
    print(f"Model: {MODEL}")

    with httpx.Client(verify=True) as client:

        # 1. Discover voices
        print("\n[1/4] Listing available voices...")
        try:
            voices = list_voices(client, key)
        except Exception as e:
            print(f"  Voice listing failed ({e}). Using fallback voice IDs.")
            voices = []

        alex_id, maya_id = pick_voices(voices)

        # 2. Build TTS text
        print("\n[2/4] Building multi-speaker script...")
        tts_text = build_tts_text(SCRIPT_PATH)
        word_count = len(tts_text.split())
        print(f"  TTS input: {len(tts_text)} chars, ~{word_count} tokens")
        # Print first 300 chars so we can see the speaker tags
        print(f"  Preview: {tts_text[:300]}...")

        # 3. Generate audio
        print("\n[3/4] Generating audio via Fish Audio API...")
        mp3_bytes = generate_tts(client, key, tts_text, alex_id, maya_id)

        if not mp3_bytes:
            sys.exit("ERROR: TTS returned empty audio.")

        print(f"  Received {len(mp3_bytes):,} bytes of MP3 audio.")

        # 4. Save outputs
        print("\n[4/4] Saving files...")
        with open(OUTPUT_MP3, "wb") as f:
            f.write(mp3_bytes)
        print(f"  podcast.mp3 written ({len(mp3_bytes):,} bytes).")

        duration = estimate_duration_seconds(mp3_bytes)
        if duration:
            mins = int(duration // 60)
            secs = int(duration % 60)
            print(f"  Estimated duration: {mins}m {secs}s")

        write_metadata(alex_id, maya_id, len(mp3_bytes), duration)

    print("\n=== POC COMPLETE ===")
    print(f"  podcast.mp3  → podcast-test/podcast.mp3")
    print(f"  metadata.json → podcast-test/metadata.json")


if __name__ == "__main__":
    main()
