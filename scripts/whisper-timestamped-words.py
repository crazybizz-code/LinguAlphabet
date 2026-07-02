import argparse
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import whisper_timestamped as whisper


def load_audio_with_bundled_ffmpeg(audio_path, sample_rate=16000):
    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_path,
        "-nostdin",
        "-threads",
        "0",
        "-i",
        audio_path,
        "-f",
        "s16le",
        "-ac",
        "1",
        "-acodec",
        "pcm_s16le",
        "-ar",
        str(sample_rate),
        "-",
    ]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0


def main():
    parser = argparse.ArgumentParser(description="Generate word timestamps with whisper-timestamped.")
    parser.add_argument("audio", help="Path to the audio file")
    parser.add_argument("--model", default="base.en", help="Whisper model name")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    audio = load_audio_with_bundled_ffmpeg(args.audio)
    model = whisper.load_model(args.model, device="cpu")
    result = whisper.transcribe(model, audio, language="en", vad=False)

    output_segments = []
    for segment in result.get("segments", []):
      output_segments.append(
          {
              "start": segment.get("start"),
              "end": segment.get("end"),
              "text": segment.get("text", ""),
              "words": [
                  {
                      "word": word.get("text", word.get("word", "")),
                      "start": word.get("start"),
                      "end": word.get("end"),
                      "probability": word.get("confidence"),
                  }
                  for word in segment.get("words", [])
                  if word.get("start") is not None and word.get("end") is not None
              ],
          }
      )

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(
        json.dumps(
            {
                "engine": "whisper-timestamped",
                "model": args.model,
                "language": result.get("language", "en"),
                "segments": output_segments,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
