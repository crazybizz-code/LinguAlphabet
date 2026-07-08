import { Tuto } from "@/components/mascot/Tuto";

export default function ExploreLoading() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Tuto pose="pointing" size="sm" animation="floatSm" />
      <p className="text-sm font-medium text-text-tertiary">Tuto is finding great content for you&hellip;</p>
    </div>
  );
}
