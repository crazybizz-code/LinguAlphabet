"""Separate the two native runtimes faster-whisper sits on.

    python scripts/asr-native-probe.py

The bisect established that stage 7 - WhisperModel("tiny.en") - crashes
with 0xC0000005, and that `import onnxruntime` crashes by itself with no
ctranslate2, no model and no audio anywhere near it. Those may be the
same fault or two different ones, and the fix is different in each case:

  * If onnxruntime is the only broken piece, ctranslate2 can still load a
    Whisper model directly, and the fix is an onnxruntime/numpy pin.
  * If ctranslate2 cannot load a model either, onnxruntime is a red
    herring and the fix is a ctranslate2 pin.

Probe 4 settles it by loading a CTranslate2 Whisper model WITHOUT
importing faster_whisper at all. That is the one measurement the bisect
could not make, because every earlier stage went through faster_whisper.

Each probe runs in its own subprocess with faulthandler enabled. Reads
only; probe 4 downloads the ~40 MB tiny.en CTranslate2 model into the
normal HuggingFace cache.
"""

import argparse
import ctypes
import os
import subprocess
import sys
from pathlib import Path

PROBES = [
    (1, "what is at faster_whisper/transcribe.py:689"),
    (2, "import onnxruntime, alone"),
    (3, "import ctranslate2 BEFORE onnxruntime"),
    (4, "ctranslate2 loads a Whisper model WITHOUT faster_whisper"),
    (5, "faster_whisper WhisperModel(tiny.en) - the known crash"),
    (6, "onnxruntime DLLs visible on PATH"),
    (7, "Microsoft Visual C++ runtime versions"),
]

CT2_TINY_REPO = "Systran/faster-whisper-tiny.en"


def dll_version(name):
    """File version of a loaded system DLL, via the Win32 version API."""
    if os.name != "nt":
        return "n/a (not Windows)"
    try:
        size = ctypes.windll.version.GetFileVersionInfoSizeW(name, None)
        if not size:
            return "not found on PATH"
        buffer = ctypes.create_string_buffer(size)
        ctypes.windll.version.GetFileVersionInfoW(name, 0, size, buffer)
        pointer = ctypes.c_void_p()
        length = ctypes.c_uint()
        if not ctypes.windll.version.VerQueryValueW(buffer, "\\", ctypes.byref(pointer), ctypes.byref(length)):
            return "no version block"
        # VS_FIXEDFILEINFO: dwFileVersionMS at offset 8, dwFileVersionLS at 12.
        raw = ctypes.string_at(pointer, length.value)
        ms = int.from_bytes(raw[8:12], "little")
        ls = int.from_bytes(raw[12:16], "little")
        return "%d.%d.%d.%d" % (ms >> 16, ms & 0xFFFF, ls >> 16, ls & 0xFFFF)
    except Exception as error:  # noqa: BLE001 - reporting only
        return "probe failed (%s)" % type(error).__name__


def run_probe(number):
    if number == 1:
        # No imports at all: just read the source that crashed.
        import faster_whisper
        path = Path(faster_whisper.__file__).parent / "transcribe.py"
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        print("file: %s" % path)
        for index in range(max(0, 689 - 12), min(len(lines), 689 + 6)):
            marker = ">>" if index + 1 == 689 else "  "
            print("%s %4d | %s" % (marker, index + 1, lines[index]))
        return 0

    if number == 2:
        import onnxruntime
        print("onnxruntime %s" % onnxruntime.__version__)
        print("providers: %s" % onnxruntime.get_available_providers())
        return 0

    if number == 3:
        # DLL load order matters on Windows: whichever library loads its
        # copy of a shared runtime first wins, and the second one can then
        # be handed a binary-incompatible one.
        import ctranslate2
        print("ctranslate2 %s loaded first" % ctranslate2.__version__)
        import onnxruntime
        print("onnxruntime %s loaded second" % onnxruntime.__version__)
        return 0

    if number == 4:
        # THE decisive probe. faster_whisper is never imported.
        import ctranslate2
        from huggingface_hub import snapshot_download

        path = snapshot_download(CT2_TINY_REPO)
        print("model at %s" % path)
        model = ctranslate2.models.Whisper(path, device="cpu", compute_type="int8")
        print("ctranslate2 loaded the Whisper model: %r" % model)
        print("=> CTranslate2 model loading WORKS. onnxruntime is the broken piece.")
        return 0

    if number == 5:
        from faster_whisper import WhisperModel
        WhisperModel("tiny.en", device="cpu", compute_type="int8")
        print("WhisperModel loaded")
        return 0

    if number == 6:
        seen = []
        for entry in os.environ.get("PATH", "").split(os.pathsep):
            if not entry:
                continue
            try:
                for candidate in Path(entry).glob("onnxruntime*.dll"):
                    seen.append(str(candidate))
            except OSError:
                continue
        print("onnxruntime DLLs on PATH: %d" % len(seen))
        for item in seen:
            print("  %s" % item)
        if seen:
            # A stray onnxruntime.dll ahead of the wheel's own copy is a
            # textbook Windows access violation.
            print("  ^ any of these OUTSIDE the venv can be loaded instead of the wheel's own copy.")
        try:
            import onnxruntime
            print("wheel location: %s" % Path(onnxruntime.__file__).parent)
        except Exception as error:  # noqa: BLE001
            print("could not import onnxruntime to compare: %s" % type(error).__name__)
        return 0

    if number == 7:
        for name in ("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"):
            print("%-22s %s" % (name, dll_version(name)))
        print("")
        print("onnxruntime needs the Microsoft Visual C++ 2015-2022 Redistributable (x64).")
        print("msvcp140.dll below 14.40 is a common cause of an access violation on import.")
        return 0

    print("unknown probe %d" % number)
    return 2


def spawn(number):
    env = dict(os.environ)
    env["PYTHONFAULTHANDLER"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    result = subprocess.run(
        [sys.executable, "-X", "faulthandler", __file__, "--probe", str(number)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    return result.returncode, result.stdout.decode("utf-8", "replace")


def describe(code):
    if code == 0:
        return "PASS"
    if code in (3221225477, -1073741819):
        return "CRASH 0xC0000005 (access violation)"
    if code in (3221225781,):
        return "CRASH 0xC0000135 (a required DLL is missing)"
    if code in (3221226505, -1073740791):
        return "CRASH 0xC0000409 (stack buffer overrun)"
    if code < 0:
        return "KILLED by signal %d" % -code
    return "FAILED exit %d" % code


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", type=int)
    args = parser.parse_args()

    if args.probe is not None:
        sys.exit(run_probe(args.probe))

    print("NATIVE RUNTIME PROBE")
    print("python: %s" % sys.executable)
    print("")

    results = {}
    for number, label in PROBES:
        sys.stdout.write("[%d] %-52s " % (number, label))
        sys.stdout.flush()
        code, output = spawn(number)
        results[number] = code
        print(describe(code))
        for line in output.strip().splitlines():
            print("    | %s" % line[:170])
        print("")

    print("=" * 64)
    ct2_ok = results.get(4) == 0
    ort_ok = results.get(2) == 0

    if ct2_ok and not ort_ok:
        print("VERDICT: CTranslate2 is fine. onnxruntime is the broken native runtime.")
        print("         Fix onnxruntime (or remove the need for it) and stage 7 will pass.")
    elif not ct2_ok and not ort_ok:
        print("VERDICT: BOTH native runtimes crash. This is an environment-wide problem -")
        print("         look at probe 7 (VC++ runtime) before pinning any Python package.")
    elif not ct2_ok and ort_ok:
        print("VERDICT: onnxruntime is fine; CTranslate2 cannot load a model.")
        print("         Pin ctranslate2, not onnxruntime.")
    else:
        print("VERDICT: both work in isolation. The crash needs both loaded together -")
        print("         compare probe 3 against probes 2 and 4.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
