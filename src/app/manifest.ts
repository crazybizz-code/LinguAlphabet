import type { MetadataRoute } from "next";

/** Baseline PWA manifest — README already lists PWA as a core capability; this completes the icon/theme wiring, not a new feature. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LinguAlphabet — AI Coach for Language Mastery",
    short_name: "LinguAlphabet",
    description:
      "AI-powered English coaching platform that guides every learner through a personalized learning journey with Tuto, your AI English coach.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FFFDFB",
    theme_color: "#FF6B00",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
