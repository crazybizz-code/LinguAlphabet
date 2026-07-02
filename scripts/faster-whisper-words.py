import argparse
import json
from pathlib import Path

from faster_whisper import WhisperModel


def main():
    parser = argparse.ArgumentParser(description="Generate word timestamps with faster-whisper.")
    parser.add_argument("audio", help="Path to the audio file")
    parser.add_argument("--model", default="medium.en", help="faster-whisper model name")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--device", default="cpu", help="Device to use")
    parser.add_argument("--compute-type", default="int8", help="Compute type")
    args = parser.parse_args()

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(
        args.audio,
        language="en",
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )

    output_segments = []
    for segment in segments:
        output_segments.append(
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "words": [
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability,
                    }
                    for word in (segment.words or [])
                    if word.start is not None and word.end is not None
                ],
            }
        )

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(
        json.dumps(
            {
                "engine": "faster-whisper",
                "model": args.model,
                "language": info.language,
                "duration": info.duration,
                "segments": output_segments,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
