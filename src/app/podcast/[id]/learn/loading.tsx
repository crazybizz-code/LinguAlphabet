import { PageLoading } from "@/components/layout/PageLoading";

// "thinking", not "typing-laptop" — that pose's file (pointing.png) renders
// with a broken transparency/checkerboard artifact (docs/ux-launch-audit.md P0).
export default function LearnLoading() {
  return <PageLoading pose="thinking" message="Tuto is setting up your session…" fullBleed />;
}
