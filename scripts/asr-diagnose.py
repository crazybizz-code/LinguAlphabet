"""Isolate a native crash in the faster-whisper stack, one stage at a time.

    python scripts/asr-diagnose.py

Windows exit code 3221225477 is 0xC0000005, an access violation: a native
library dereferenced bad memory and took the process down. Python never
sees an exception, so a traceback does not exist and the wrapper can only
report "exited 3221225477". The only way to learn anything is to make the
crash happen in the smallest possible program.

So every stage below runs in its OWN subprocess, ordered cheapest-first,
and the driver survives whichever one dies. The first stage that crashes
IS the answer:

    1-2   ctranslate2 import / native runtime  -> CPU ISA or a bad wheel
    3-4   faster_whisper import / versions     -> dependency ABI mismatch
    5     audio download                       -> not native at all
    6     decode_audio                         -> PyAV / FFmpeg bindings
    7-8   model load (tiny, then medium)       -> corrupt cache or int8 path
    9-11  transcribe: plain / +VAD / +words    -> onnxruntime VAD, or the
                                                  word-alignment pass
    12    medium with our exact settings       -> scale or config
    13-14 scripts/faster-whisper-words.py      -> our wrapper

Children run with faulthandler enabled, so if Python IS still on the
stack when it dies you get the C-level frame instead of nothing.

When a stage crashes, the driver retries it with the three environment
mitigations that most often resolve 0xC0000005 in this stack, and reports
which one (if any) works. That frequently identifies the fix outright.

Reads only, downloads one MP3, writes nothing outside ./asr-diag/.
"""

import argparse
import os
import platform
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

FEED_URL = "https://learningenglish.voanews.com/podcast/?zoneId=3521"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
WORK = Path("asr-diag")
AUDIO = WORK / "episode.mp3"
WRAPPER = Path("scripts/faster-whisper-words.py")

# Tried one at a time against whichever stage crashed.
#   CT2_FORCE_CPU_ISA  - CTranslate2 dispatches on CPU features at runtime;
#                        GENERIC disables that and is the test for "this
#                        wheel is using an instruction this CPU lacks".
#   KMP_DUPLICATE_LIB_OK - two copies of Intel OpenMP loaded into one
#                        process is the classic Windows AV in ML stacks.
#   OMP_NUM_THREADS    - single-threaded removes every threading race.
MITIGATIONS = [
    ("CT2_FORCE_CPU_ISA=GENERIC", {"CT2_FORCE_CPU_ISA": "GENERIC"}),
    ("KMP_DUPLICATE_LIB_OK=TRUE", {"KMP_DUPLICATE_LIB_OK": "TRUE"}),
    ("OMP_NUM_THREADS=1", {"OMP_NUM_THREADS": "1"}),
    ("all three combined", {"CT2_FORCE_CPU_ISA": "GENERIC", "KMP_DUPLICATE_LIB_OK": "TRUE", "OMP_NUM_THREADS": "1"}),
]

STAGES = [
    (1, "import ctranslate2"),
    (2, "ctranslate2 native runtime probe"),
    (3, "import faster_whisper"),
    (4, "package versions"),
    (5, "download one real VOA episode"),
    (6, "decode the MP3 (PyAV/FFmpeg)"),
    (7, "load tiny.en int8"),
    (8, "load medium.en int8"),
    (9, "transcribe tiny: no VAD, no word timestamps"),
    (10, "transcribe tiny: VAD on"),
    (11, "transcribe tiny: word timestamps on"),
    (12, "transcribe medium.en with our exact settings"),
    (13, "scripts/faster-whisper-words.py with tiny.en"),
    (14, "scripts/faster-whisper-words.py with medium.en"),
]


def download_audio():
    WORK.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(FEED_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        xml = response.read().decode("utf-8", "replace")

    match = re.search(r'<enclosure[^>]+url="([^"]+)"', xml)
    if not match:
        print("No <enclosure> in the feed.")
        return 1
    url = match.group(1)
    print("audio url: " + url)

    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=300) as response:
        data = response.read()
    AUDIO.write_bytes(data)

    head = data[:4]
    # A truncated download or an HTML error page reaching the decoder is a
    # perfectly good way to crash PyAV, and HEAD-based audio validation
    # upstream would not have caught either.
    looks_like_mp3 = head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0)
    print("bytes: %d" % len(data))
    print("first 4 bytes: %s" % head.hex())
    print("looks like mp3: %s" % looks_like_mp3)
    if not looks_like_mp3:
        print("NOT AN MP3 - the decoder is being handed something else.")
        return 1
    return 0


def transcribe(model_name, vad, words, beam):
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(AUDIO),
        language="en",
        word_timestamps=words,
        vad_filter=vad,
        beam_size=beam,
        condition_on_previous_text=False,
    )
    print("duration reported: %s" % info.duration)
    count = 0
    for segment in segments:
        count += 1
        if count == 1:
            print("first segment: %s" % segment.text.strip()[:80])
        # Three segments is enough to prove decode + compute + iteration
        # all work; transcribing the whole episode proves nothing extra
        # and costs minutes.
        if count >= 3:
            break
    print("segments iterated: %d" % count)
    return 0


def run_wrapper(model_name):
    output = WORK / ("words-%s.json" % model_name)
    result = subprocess.run(
        [sys.executable, str(WRAPPER), str(AUDIO),
         "--model", model_name, "--output", str(output),
         "--device", "cpu", "--compute-type", "int8"],
    )
    if result.returncode == 0:
        print("wrote %s (%d bytes)" % (output, output.stat().st_size if output.exists() else 0))
    return result.returncode


def run_stage(stage):
    if stage == 1:
        import ctranslate2
        print("ctranslate2 %s" % ctranslate2.__version__)
        return 0

    if stage == 2:
        import ctranslate2
        print("cpu compute types: %s" % sorted(ctranslate2.get_supported_compute_types("cpu")))
        print("cuda devices: %d" % ctranslate2.get_cuda_device_count())
        return 0

    if stage == 3:
        import faster_whisper
        print("faster_whisper %s" % getattr(faster_whisper, "__version__", "unknown"))
        return 0

    if stage == 4:
        print("python      %s" % sys.version.replace("\n", " "))
        print("executable  %s" % sys.executable)
        print("platform    %s / %s" % (platform.platform(), platform.processor()))
        for name in ("ctranslate2", "faster_whisper", "numpy", "av", "onnxruntime", "torch", "tokenizers", "huggingface_hub"):
            try:
                module = __import__(name)
                print("%-16s %s" % (name, getattr(module, "__version__", "unknown")))
            except Exception as error:  # noqa: BLE001 - reporting, not handling
                print("%-16s NOT INSTALLED (%s)" % (name, type(error).__name__))
        return 0

    if stage == 5:
        return download_audio()

    if stage == 6:
        from faster_whisper.audio import decode_audio
        audio = decode_audio(str(AUDIO))
        print("decoded samples: %d (%.1f s at 16 kHz)" % (len(audio), len(audio) / 16000.0))
        return 0

    if stage == 7:
        from faster_whisper import WhisperModel
        WhisperModel("tiny.en", device="cpu", compute_type="int8")
        print("tiny.en loaded")
        return 0

    if stage == 8:
        from faster_whisper import WhisperModel
        WhisperModel("medium.en", device="cpu", compute_type="int8")
        print("medium.en loaded")
        return 0

    if stage == 9:
        return transcribe("tiny.en", vad=False, words=False, beam=1)
    if stage == 10:
        return transcribe("tiny.en", vad=True, words=False, beam=1)
    if stage == 11:
        return transcribe("tiny.en", vad=False, words=True, beam=1)
    if stage == 12:
        return transcribe("medium.en", vad=True, words=True, beam=5)
    if stage == 13:
        return run_wrapper("tiny.en")
    if stage == 14:
        return run_wrapper("medium.en")

    print("unknown stage %d" % stage)
    return 2


def spawn(stage, extra_env=None):
    env = dict(os.environ)
    env["PYTHONFAULTHANDLER"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    if extra_env:
        env.update(extra_env)

    result = subprocess.run(
        [sys.executable, "-X", "faulthandler", __file__, "--stage", str(stage)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    return result.returncode, result.stdout.decode("utf-8", "replace")


def describe(code):
    if code == 0:
        return "PASS"
    if code == 3221225477 or code == -1073741819:
        return "CRASH 0xC0000005 (access violation)"
    if code == 3221225781:
        return "CRASH 0xC0000135 (a required DLL is missing)"
    if code == 3221226505 or code == -1073740791:
        return "CRASH 0xC0000409 (stack buffer overrun)"
    if code < 0:
        return "KILLED by signal %d" % -code
    return "FAILED exit %d" % code


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stage", type=int, help="internal: run one stage in this process")
    parser.add_argument("--only", type=int, help="run a single stage (with mitigations) and stop")
    parser.add_argument("--from", dest="start", type=int, default=1, help="start at this stage")
    args = parser.parse_args()

    # Child process: do the risky thing and let it crash if it wants to.
    if args.stage is not None:
        sys.exit(run_stage(args.stage))

    print("ASR CRASH BISECT")
    print("cwd:    %s" % Path.cwd())
    print("python: %s" % sys.executable)
    if not WRAPPER.exists():
        print("\nRun this from the repository root - %s not found." % WRAPPER)
        return 1
    print("")

    stages = [s for s in STAGES if (args.only is None and s[0] >= args.start) or s[0] == args.only]
    first_bad = None

    for number, label in stages:
        sys.stdout.write("[%2d] %-46s " % (number, label))
        sys.stdout.flush()
        code, output = spawn(number)
        print(describe(code))

        for line in output.strip().splitlines():
            print("     | %s" % line[:160])

        if code != 0:
            first_bad = (number, label, code)
            print("")
            print("     Retrying stage %d with mitigations:" % number)
            fixed_by = None
            for name, env in MITIGATIONS:
                retry_code, retry_output = spawn(number, env)
                print("       %-28s %s" % (name, describe(retry_code)))
                if retry_code == 0 and fixed_by is None:
                    fixed_by = name
                    for line in retry_output.strip().splitlines()[:4]:
                        print("         | %s" % line[:150])
            print("")
            if fixed_by:
                print("     ==> %s makes stage %d pass. That is the cause." % (fixed_by, number))
            else:
                print("     ==> No mitigation helped. The failure is in stage %d itself." % number)
            break
        print("")

    print("")
    if first_bad is None:
        print("Every stage passed. The crash is not reproducible outside the Node subprocess -")
        print("re-run the proof and compare PYTHON_BIN and the working directory.")
    else:
        number, label, code = first_bad
        print("FIRST FAILING STAGE: %d - %s" % (number, label))
        print("  %s" % describe(code))
        print("  Everything before it works, so the cause is in that stage and no earlier.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
