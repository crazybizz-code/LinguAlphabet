import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Log In",
  description: "Log in to LinguABC to continue your personalized English coaching journey with Tuto, your AI coach.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
