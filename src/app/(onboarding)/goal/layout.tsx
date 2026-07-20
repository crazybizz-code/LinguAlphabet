import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Your Learning Goal",
  description:
    "Choose what you want to achieve with English — from exam prep to career growth — so Tuto can build your plan.",
  path: "/goal",
  index: false,
});

export default function GoalLayout({ children }: { children: ReactNode }) {
  return children;
}
