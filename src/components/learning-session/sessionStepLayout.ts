/**
 * One shared desktop-aware container for every Learning Session step, so
 * moving from Listen (which owns a wide two-column canvas) into Summary /
 * Vocabulary / Flashcards / Quiz / Reflection / Complete never drops back
 * into a stretched mobile screen. Mobile/tablet (<lg) is byte-identical to
 * the original single-column sizing; lg+ widens the canvas and opens up
 * padding to match Listen's. Each step still decides internally how much of
 * that width its own content uses — Listen's two-column transcript layout
 * fills it, every other step centers its single-focus card via
 * SESSION_STEP_CONTENT rather than stretching a quiz question or reflection
 * prompt edge to edge.
 */
export const SESSION_STEP_CONTAINER = "mx-auto max-w-2xl px-5 py-6 sm:px-8 lg:max-w-6xl lg:px-10 lg:py-12";

/** Centers a step's task card at a comfortable desktop reading width inside the wider container above. */
export const SESSION_STEP_CONTENT = "lg:mx-auto lg:max-w-3xl";
