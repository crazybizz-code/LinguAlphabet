import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads the project's own env files into `process.env`, the way Next.js
 * already does for `next dev` and `next build`.
 *
 * WHY THIS IS HERE. Next.js reads `.env.local`/`.env` itself, so the app
 * has GEMINI_API_KEY and nothing in the codebase has to think about it.
 * Vitest is a different runner and does no such thing, so an operator
 * script calling real project code got "GEMINI_API_KEY is not configured"
 * while the identical code worked in the app. The gap was the runner's,
 * not the Gemini client's — which is why the fix is here and the client
 * is untouched.
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
  },
});
