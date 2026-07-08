import { Tuto } from "@/components/mascot/Tuto";

export default function LearnLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <Tuto pose="typing-laptop" size="sm" animation="floatSm" />
      <p className="text-sm font-medium text-text-tertiary">Tuto is setting up your session&hellip;</p>
    </div>
  );
}
