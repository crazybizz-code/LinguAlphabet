import type { OrchestratorDecision } from "@/ai/learning-orchestrator";

const ACTION_INSTRUCTIONS: Record<OrchestratorDecision["action"], string> = {
  continue: "Keep moving through the current step naturally — no special adjustment needed this turn.",
  repeat: "The learner's last attempt didn't land — give them another, similar attempt at the same point rather than moving on, without making it feel like a penalty.",
  simplify: "Lower the difficulty of what you're asking for right now — shorter sentences, an easier variant of the same task, or a supporting example before asking again.",
  "give-hint": "Offer one concrete hint or a smaller guiding question rather than the full answer — help them get there themselves.",
  celebrate: "This moment calls for genuine, specific celebration of what the learner just accomplished before moving on.",
  skip: "The upcoming review isn't needed anymore — move past it naturally, no need to mention it was ever planned.",
  escalate: "The learner is still stuck after a hint or a repeat — this time, just explain it plainly and directly rather than prompting further.",
  finish: "This is the close of the session — wrap up warmly, acknowledge what was covered, and don't start a new topic.",
};

/**
 * Renders the Learning Orchestrator's live decision (src/ai/learning-orchestrator)
 * — the one thing that changes every single turn, unlike the Teaching
 * Plan and Session Plan above it which are decided once per session. Only
 * the decision's `action` and `reviewPointTopic` are instructions;
 * `reason`/`basedOn`/`nextState`/`openQuestions` are traceability for
 * debugging, not something to render into the prompt — see
 * ORCHESTRATOR_DECISION_USAGE (./sections.ts) for how the model should
 * use this.
 */
export function buildOrchestratorDecisionBlock(decision?: OrchestratorDecision | null): string | null {
  if (!decision) return null;

  const lines: string[] = [`Right now: ${ACTION_INSTRUCTIONS[decision.action]}`];

  if (decision.reviewPointTopic) {
    lines.push(`Also bring up a review of "${decision.reviewPointTopic}" naturally around this point in the conversation.`);
  }

  return lines.join("\n");
}
