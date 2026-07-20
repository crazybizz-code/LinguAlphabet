import type { ReactNode } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Daily Study Time",
  description: "Set how much time you can commit each day so Tuto can pace your English learning plan.",
  path: "/daily-time",
  index: false,
});

export default function DailyTimeLayout({ children }: { children: ReactNode }) {
  return children;
}
