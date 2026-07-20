import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Forgot Password",
  description: "Reset your LinguABC account password to get back to your English coaching sessions with Tuto.",
  path: "/forgot-password",
  index: false,
});

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
