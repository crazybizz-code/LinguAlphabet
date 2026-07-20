import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "What's Your Name?",
  description: "Tell Tuto your name so your English coaching experience feels personal from the start.",
  path: "/name",
  index: false,
});

export default function NameLayout({ children }: { children: ReactNode }) {
  return children;
}
