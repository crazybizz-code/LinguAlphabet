import type { MockListeningSectionContract } from "@/lib/mock/content/types";
import type { AssembledQuestionRow } from "@/lib/mock/content/validator";

/**
 * LISTENING SECTION 2 — transcript-first, side-effect-free content.
 *
 * Original IELTS-style monologue in a social/everyday setting. The recording
 * was authored before the questions, and every answer-bearing passage occurs
 * in question order. audioUrl deliberately remains null.
 */

export const SECTION_2_ID = "listening-s2-millbrook-community-hub";

export const SECTION_2_TRANSCRIPT = `MAYA: Good morning, everyone, and welcome to Millbrook Community Hub. I'm Maya Shah, the centre manager. Today you can look around, try an activity and meet some of our regular groups. I'll begin with what's changed since last autumn, then cover bookings and where to find today's services.

Let's start with the improvements. Cyclists may remember the metal rail beside the rubbish bins. We'll still use it if we get very busy, but we've turned the old repair workshop by the east gate into a locked room where bikes can be left under cover.

Drivers haven't gained anything similar. The council did discuss adding another row of parking spaces, but the ground was too wet and that plan has been shelved.

Some of you asked us to keep the café open into the evening. Its hours are unchanged this weekend. The change people seem happiest about is the new booking page on our website. You can now see free places and reserve one straight away. We had hoped to put a roof over the tables in the back garden as well, but the contractor can't start that job until spring.

Now, most events need no advance registration. The bread-making demonstration is repeated three times, and you can simply join the next one with space. For the guided wildlife-garden walk, collect a free ticket from the guide when you arrive.

There are two exceptions. Because there are only eight wheels, you do need to reserve the pottery class by six o'clock on Friday evening. The talk about Millbrook's old railway may sound restricted, but the library holds nearly eighty people, so just turn up. Finally, we also need children's names in advance for the drama session, as the leaders arrange age groups before Saturday. Parents can watch without booking.

Now for a quick tour, because several services have moved for the weekend.

If you reserved either of those limited activities, don't head directly to the pottery or drama rooms. Start at the reception desk, immediately inside the main doors. The team there will check your name and give you a coloured wristband. That band is what the activity leader needs to see; a confirmation email on your phone isn't enough.

For coats, umbrellas or larger bags, don't use the old cloakroom beside reception; that's closed while the heating is repaired. Instead, we've made a supervised cloakroom in the far corner of the sports hall.

For food, the café counter in the entrance passage has sandwiches, fruit and cold drinks. However, tea, coffee and hot chocolate will come from the serving hatch in the community kitchen.

If you're considering helping regularly, there are leaflets on the reception desk, but don't try to discuss roles with the staff working there. The volunteer team will be based in the upstairs meeting room and can explain what's involved.

We also have a display showing how the neighbourhood has changed. One photograph is on the noticeboard near Studio One, which may make you think the exhibition is there. That's only a sign pointing you onwards. The complete display is in the library, beyond the local-history shelves.

To finish the day, the community choir will lead a sing-along in the courtyard. You don't have to belong to the choir, and song sheets will be handed out there. If it rains heavily we'll move into the sports hall, but the forecast is dry and the courtyard is the planned location.

Studio One is for pottery, Studio Two for drama, and the garden pavilion is where the walk finishes. Staff in orange badges can help if you get lost.

That's everything from me. The doors are open now, so collect anything you need from reception and enjoy your day at Millbrook.`;

const IMPROVEMENT_OPTIONS = [
  { id: "A", text: "more spaces for cars" },
  { id: "B", text: "secure indoor bicycle storage" },
  { id: "C", text: "longer café opening hours" },
  { id: "D", text: "web-based activity reservations" },
  { id: "E", text: "sheltered outdoor tables" },
];

const ADVANCE_BOOKING_OPTIONS = [
  { id: "A", text: "bread-making demonstration" },
  { id: "B", text: "guided garden walk" },
  { id: "C", text: "pottery workshop" },
  { id: "D", text: "local-history talk" },
  { id: "E", text: "children's drama session" },
];

const LOCATION_OPTIONS = [
  { id: "A", text: "reception desk" },
  { id: "B", text: "Studio One" },
  { id: "C", text: "Studio Two" },
  { id: "D", text: "community kitchen" },
  { id: "E", text: "library" },
  { id: "F", text: "courtyard" },
  { id: "G", text: "garden pavilion" },
  { id: "H", text: "sports hall" },
  { id: "I", text: "upstairs meeting room" },
];

export const LISTENING_SECTION_2: MockListeningSectionContract = {
  id: SECTION_2_ID,
  title: "Millbrook Community Hub — open weekend orientation",
  difficulty: "B2",
  transcript: SECTION_2_TRANSCRIPT,
  audioUrl: null,
  questionGroups: [
    {
      groupId: "ls2-improvements-choose-two",
      taskType: "multiple_choice",
      instructions: "Questions 11–12\nWhich TWO improvements have been made at Millbrook Community Hub since last year's open weekend?\nChoose TWO letters, A–E.",
      optionPool: IMPROVEMENT_OPTIONS,
      questions: [
        {
          id: "ls2-q11", skill: "listening", type: "multiple_choice", order: 11,
          questionText: "Millbrook improvement choice — mark 1",
          correctAnswer: "B", difficulty: "B2", structuralParentId: SECTION_2_ID,
          groupId: "ls2-improvements-choose-two",
        },
        {
          id: "ls2-q12", skill: "listening", type: "multiple_choice", order: 12,
          questionText: "Millbrook improvement choice — mark 2",
          correctAnswer: "D", difficulty: "B2", structuralParentId: SECTION_2_ID,
          groupId: "ls2-improvements-choose-two",
        },
      ],
    },
    {
      groupId: "ls2-booking-choose-two",
      taskType: "multiple_choice",
      instructions: "Questions 13–14\nWhich TWO activities must be booked before the open weekend begins?\nChoose TWO letters, A–E.",
      optionPool: ADVANCE_BOOKING_OPTIONS,
      questions: [
        {
          id: "ls2-q13", skill: "listening", type: "multiple_choice", order: 13,
          questionText: "Advance-booking activity — mark 1",
          correctAnswer: "C", difficulty: "B2", structuralParentId: SECTION_2_ID,
          groupId: "ls2-booking-choose-two",
        },
        {
          id: "ls2-q14", skill: "listening", type: "multiple_choice", order: 14,
          questionText: "Advance-booking activity — mark 2",
          correctAnswer: "E", difficulty: "B2", structuralParentId: SECTION_2_ID,
          groupId: "ls2-booking-choose-two",
        },
      ],
    },
    {
      groupId: "ls2-locations-matching",
      taskType: "matching",
      instructions: "Questions 15–20\nWhere should visitors go for each of the following purposes?\nChoose the correct letter, A–I.\nEach letter may be used once only.",
      optionPool: LOCATION_OPTIONS,
      questions: [
        {
          id: "ls2-q15", skill: "listening", type: "matching", order: 15,
          questionText: "Receive the pass needed for a reserved session",
          correctAnswer: "A", difficulty: "B1", structuralParentId: SECTION_2_ID,
          groupId: "ls2-locations-matching",
        },
        {
          id: "ls2-q16", skill: "listening", type: "matching", order: 16,
          questionText: "Store coats and other personal belongings",
          correctAnswer: "H", difficulty: "B2", structuralParentId: SECTION_2_ID,
          groupId: "ls2-locations-matching",
        },
        {
          id: "ls2-q17", skill: "listening", type: "matching", order: 17,
          questionText: "Buy a warm drink",
          correctAnswer: "D", difficulty: "B1", structuralParentId: SECTION_2_ID,
          groupId: "ls2-locations-matching",
        },
        {
          id: "ls2-q18", skill: "listening", type: "matching", order: 18,
          questionText: "Discuss becoming a regular helper",
          correctAnswer: "I", difficulty: "B2", structuralParentId: SECTION_2_ID,
          groupId: "ls2-locations-matching",
        },
        {
          id: "ls2-q19", skill: "listening", type: "matching", order: 19,
          questionText: "View images showing the area's past",
          correctAnswer: "E", difficulty: "B2", structuralParentId: SECTION_2_ID,
          groupId: "ls2-locations-matching",
        },
        {
          id: "ls2-q20", skill: "listening", type: "matching", order: 20,
          questionText: "Join the final music event",
          correctAnswer: "F", difficulty: "B1", structuralParentId: SECTION_2_ID,
          groupId: "ls2-locations-matching",
        },
      ],
    },
  ],
};

/** Flat persisted-row representation used by QA and a future importer. */
export const LISTENING_SECTION_2_DB_ROWS: AssembledQuestionRow[] =
  LISTENING_SECTION_2.questionGroups.flatMap((group) => group.questions.map((question) => ({
    id: question.id,
    skill: question.skill,
    type: question.type,
    question: question.questionText,
    options: question.options ?? null,
    correct_answer: question.correctAnswer,
    accepted_answers: question.acceptedAnswers ?? null,
    answer_word_limit: null,
    option_pool: group.optionPool ?? null,
    mock_group_id: group.groupId,
    mock_group_instructions: group.instructions,
    mock_sequence: question.order,
    difficulty: question.difficulty,
    mock_passage_id: null,
    mock_listening_section_id: SECTION_2_ID,
  })));
