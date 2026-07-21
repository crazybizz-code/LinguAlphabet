import { registerProvider } from "./registry";
import { createOpenRouterProvider } from "./openrouter";

let bootstrapped = false;

/** Idempotent — safe to call on every request; only registers providers once per server instance. */
export function bootstrapProviders(): void {
  if (bootstrapped) return;
  registerProvider(createOpenRouterProvider());
  bootstrapped = true;
}
