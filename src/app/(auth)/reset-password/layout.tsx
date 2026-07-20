import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Reset Password",
  description: "Choose a new password for your LinguABC account.",
  path: "/reset-password",
  index: false,
});

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
