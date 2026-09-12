import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname, "..", "..");
const listeningPage = readFileSync(
  path.join(SRC, "app", "(app)", "mock", "[attemptId]", "listening", "page.tsx"),
  "utf8",
);
const listeningClient = readFileSync(
  path.join(SRC, "components", "mock", "MockListeningClient.tsx"),
  "utf8",
);
const listeningSectionPanel = readFileSync(
  path.join(SRC, "components", "mock", "ListeningSectionPanel.tsx"),
  "utf8",
);

describe("Listening server hydration", () => {
  it("selects persisted group instructions with the client-safe question metadata", () => {
    expect(listeningPage).toContain("mock_group_id, mock_group_instructions, mock_sequence");
  });

  it("passes the persisted instruction through instead of hard-coding null", () => {
    expect(listeningPage).toContain("groupInstructions: q.mock_group_instructions ?? null");
    expect(listeningPage).not.toContain("groupInstructions: null");
  });

  it("does not select or expose the section transcript", () => {
    expect(listeningPage).toContain('.select("id, title, audio_url")');
    expect(listeningPage).not.toContain('.select("id, title, audio_url, transcript")');
  });

  it("passes coherent sections rather than a flat question payload", () => {
    expect(listeningPage).toContain("const sections = buildListeningSections(");
    expect(listeningPage).toContain("sections={sections}");
    expect(listeningPage).not.toContain("questions={questions}");
  });

  it("keeps autosave and saved-answer hydration compatible", () => {
    expect(listeningClient).toContain("useState<Record<string, string | null>>(savedAnswers)");
    expect(listeningClient).toContain('section: "listening"');
    expect(listeningClient).toContain("userAnswer: answer");
    expect(listeningClient).toContain("sequenceNumber: q.sequenceNumber");
    expect(listeningClient).toContain("function handleSelect(questionId: string, answer: string)");
    expect(listeningClient).toContain("saveAnswer(questionId, answer)");
  });

  it("autosaves both normalized choose-two response rows", () => {
    expect(listeningClient).toContain("encodeChooseTwoResponses(group, selections)");
    expect(listeningClient).toContain("chooseTwoSaveQueuesRef");
    expect(listeningClient).toContain("updates.map((update) => saveAnswer(update.questionId, update.answer))");
  });

  it("tracks one-play state by section and documents the refresh limitation", () => {
    expect(listeningClient).toContain("playedAudioSectionIds");
    expect(listeningClient).toContain("browser refresh");
    expect(listeningClient).not.toContain("playedAudioIds");
  });

  it("keys the single section audio player by section rather than question", () => {
    expect(listeningSectionPanel.match(/<ListeningAudioPlayer/g)).toHaveLength(1);
    expect(listeningSectionPanel).toContain("key={section.sectionId}");
    expect(listeningSectionPanel).not.toContain("key={currentQuestionId}");
  });
});
