import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Your English Level",
  description: "Tell us your current English level so Tuto can tailor your learning plan.",
  path: "/level",
  index: false,
});

export default function LevelLayout({ children }: { children: ReactNode }) {
  return children;
}
