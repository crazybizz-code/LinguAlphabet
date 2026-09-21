import { describe, expect, it, vi } from "vitest";
import { ListeningSaveCoordinator } from "./listening-save-coordinator";

describe("ListeningSaveCoordinator", () => {
  it("waits for all tracked autosaves before submission may continue", async () => {
    const coordinator = new ListeningSaveCoordinator();
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    coordinator.track(new Promise<void>((resolve) => { finishFirst = resolve; }));
    coordinator.track(new Promise<void>((resolve) => { finishSecond = resolve; }));

    const complete = vi.fn();
    const draining = coordinator.drain().then(complete);
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();

    finishFirst();
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();

    finishSecond();
    await draining;
    expect(complete).toHaveBeenCalledOnce();
    expect(coordinator.size).toBe(0);
  });

  it("fails submission drain when an autosave failed", async () => {
    const coordinator = new ListeningSaveCoordinator();
    coordinator.track(Promise.reject(new Error("autosave failed"))).catch(() => undefined);

    await expect(coordinator.drain()).rejects.toThrow("autosave failed");
  });
});
