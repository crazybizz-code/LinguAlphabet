import { Tuto, type TutoSize } from "./Tuto";
import { cn } from "@/lib/utils";

export type TutoOnlineStatus = "ready" | "thinking" | "typing";

const STATUS_DOT_CLASS: Record<TutoOnlineStatus, string> = {
  ready: "bg-success",
  thinking: "bg-amber-400",
  typing: "bg-primary",
};

/**
 * Tuto's own render plus a small "online" status dot pinned to its
 * bottom-right corner — shared between the sidebar's "Tuto · Ready to
 * help" card and the Tuto Workspace header (both from the Base44
 * reference), so the two never drift on exactly how the dot is sized or
 * positioned. `status` defaults to "ready" (the original, only-ever
 * behavior) so every existing call site — DashboardSidebar,
 * DashboardBottomNav — renders byte-identical to before; only Tuto
 * Workspace's header passes a real, live status.
 */
export function TutoOnlineAvatar({
  size = "xs",
  status = "ready",
  className,
}: {
  size?: TutoSize;
  status?: TutoOnlineStatus;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Tuto pose="neutral" size={size} animation="none" />
      <span
        className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg-card", STATUS_DOT_CLASS[status])}
        aria-hidden="true"
      />
    </div>
  );
}
