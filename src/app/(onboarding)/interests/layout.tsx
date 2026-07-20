import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Your Interests",
  description: "Pick topics you enjoy so Tuto can recommend English lessons you'll actually want to learn from.",
  path: "/interests",
  index: false,
});

export default function InterestsLayout({ children }: { children: ReactNode }) {
  return children;
}
