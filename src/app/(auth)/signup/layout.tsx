import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Sign Up",
  description: "Create your free LinguABC account and start learning English with Tuto, your AI coach, today.",
  path: "/signup",
});

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
