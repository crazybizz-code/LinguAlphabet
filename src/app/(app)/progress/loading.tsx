import { Tuto } from "@/components/mascot/Tuto";

export default function ProgressLoading() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Tuto pose="thinking" size="sm" animation="floatSm" />
      <p className="text-sm font-medium text-text-tertiary">Tuto is reviewing your journey&hellip;</p>
    </div>
  );
}
