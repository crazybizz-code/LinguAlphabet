import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const audioDirectory = path.join(root, "content", "listening-section-2", "audio");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function snapshot(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map((entry) => {
      const file = path.join(directory, entry);
      const stat = statSync(file);
      return `${entry}:${stat.size}:${stat.mtimeMs}`;
    })
    .sort();
}

function runPlan() {
  return spawnSync(process.execPath, [tsxCli, "scripts/listening-section-2-audio.ts", "--plan"], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    env: {
      ...process.env,
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
      ALL_PROXY: "http://127.0.0.1:1",
      NO_PROXY: "",
    },
  });
}

describe("Listening Section 2 audio plan", () => {
  it("is deterministic, resolves its source, and performs no audio writes or network-dependent work", () => {
    const before = snapshot(audioDirectory);
    const first = runPlan();
    const middle = snapshot(audioDirectory);
    const second = runPlan();
    const after = snapshot(audioDirectory);

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(middle).toEqual(before);
    expect(after).toEqual(before);
    expect(first.stdout).toContain("source resolved: true");
    expect(first.stdout).toContain("voice: en-GB-SoniaNeural");
    expect(first.stdout).toContain("rate: -20%");
    expect(first.stdout).toContain("section-2-candidate-v3.mp3");
    expect(first.stdout).toContain("promotion: disabled pending human comparison");
    expect(first.stdout).toContain("leading=1.5s, intro=2.5s, improvements=5.0s, booking=6.0s, tail=3.0s");
    expect(first.stdout).toContain("PLAN COMPLETE — no directories, audio files, subprocesses, or network calls were created or invoked.");
  });
});
