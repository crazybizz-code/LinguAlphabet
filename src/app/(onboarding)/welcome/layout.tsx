import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Welcome",
  description: "Meet Tuto, your AI English coach, and get started with your personalized learning journey.",
  path: "/welcome",
  index: false,
});

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return children;
}
