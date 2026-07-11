/**
 * The controlled topic vocabulary — collected once in onboarding
 * (src/app/(onboarding)/interests/page.tsx) and reused everywhere a topic
 * gets attached to content, so AI-generated topics (Content Engine) can
 * never drift from what a learner actually selected as an interest.
 */
export const CONTROLLED_TOPICS = [
  "Technology",
  "Business",
  "Science",
  "Movies",
  "Books",
  "Gaming",
  "Music",
  "Travel",
  "Sports",
  "Food",
] as const;
