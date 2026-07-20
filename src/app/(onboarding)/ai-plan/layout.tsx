import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Your AI-Powered Plan",
  description: "Tuto is building your personalized English learning plan based on your goals and level.",
  path: "/ai-plan",
  index: false,
});

export default function AiPlanLayout({ children }: { children: ReactNode }) {
  return children;
}
