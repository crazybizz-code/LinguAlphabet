import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "You're All Set",
  description: "Your personalized English learning journey with Tuto is ready to begin.",
  path: "/ready",
  index: false,
});

export default function ReadyLayout({ children }: { children: ReactNode }) {
  return children;
}
