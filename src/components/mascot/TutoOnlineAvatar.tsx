import { Tuto, type TutoSize } from "./Tuto";
import { cn } from "@/lib/utils";

/**
 * Tuto's own render plus a small "online" status dot pinned to its
 * bottom-right corner — shared between the sidebar's "Tuto · Ready to
 * help" card and the Tuto Workspace header (both from the Base44
 * reference), so the two never drift on exactly how the dot is sized or
 * positioned.
 */
export function TutoOnlineAvatar({ size = "xs", className }: { size?: TutoSize; className?: string }) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Tuto pose="neutral" size={size} animation="none" />
      <span
        className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg-card bg-success"
        aria-hidden="true"
      />
    </div>
  );
}
