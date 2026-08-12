import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads the project's own env files into `process.env`, the way Next.js
 * already does for `next dev` and `next build`.
 *
 * WHY THIS IS HERE. Next.js reads `.env.local`/`.env` itself, so the app
 * has its AI credentials and nothing in the codebase has to think about
 * it. Vitest is a different runner and does no such thing, so an operator
 * script calling real project code reported the credential as missing
 * while the identical code worked in the app. The gap was the runner's,
 * not any provider client's — which is why the fix is here and no client
 * was touched.
 *
 * PRECEDENCE, matching Next.js: `.env.local` beats `.env`, and anything
 * already in the real environment beats both. That last rule is what
 * makes `VOA_ASR_ENRICH=1 npx vitest ...` behave the way you would
 * expect — a value set on the command line is never silently overwritten
 * by a file.
 *
 * SECRETS STAY WHERE THEY ARE. Both files are gitignored, nothing is
 * copied into source, and nothing is printed. This only makes values the
 * developer already has on disk visible to the process that needs them.
 */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;

    const key = trimmed.slice(0, equals).trim();
    // A real environment value always wins over a file, so an explicit
    // override on the command line is never clobbered.
    if (process.env[key] !== undefined) continue;

    let value = trimmed.slice(equals + 1).trim();
    if (
      value.length > 1 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, ".env.local"));
loadEnvFile(path.resolve(__dirname, ".env"));

// Mirrors tsconfig.json's "@/*" -> "./src/*" path alias so test files can
// import production modules exactly the way the app itself does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // scripts/*.test.ts includes real-IO operator scripts invoked
    // deliberately by exact filename (e.g. the daily podcast worker,
    // scripts/run-daily-episode.ts, is a plain tsx entrypoint, not a
    // vitest test, for exactly this reason). Vitest's default include
    // glob matches any **/*.test.ts, so a bare `npx vitest run` with no
    // path filter would otherwise sweep these up alongside real unit
    // tests. scripts/ingest-podcasts.test.ts is safe on its own (fully
    // mocked, no real IO) but is excluded here too for consistency --
    // its real worker also runs via `npm run ingest-podcasts` (tsx), not
    // vitest, so nothing depends on it being discoverable by a bare run.
    exclude: ["**/node_modules/**", "**/dist/**", "scripts/**"],
  },
});
