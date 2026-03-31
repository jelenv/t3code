import { describe, expect, it } from "vitest";

import { splitPromptIntoComposerSegments } from "./composer-editor-mentions";
import { INLINE_SKILL_PLACEHOLDER } from "./lib/composerSkills";
import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "./lib/terminalContext";

describe("splitPromptIntoComposerSegments", () => {
  it("splits mention tokens followed by whitespace into mention segments", () => {
    expect(splitPromptIntoComposerSegments("Inspect @AGENTS.md please")).toEqual([
      { type: "text", text: "Inspect " },
      { type: "mention", path: "AGENTS.md" },
      { type: "text", text: " please" },
    ]);
  });

  it("does not convert an incomplete trailing mention token", () => {
    expect(splitPromptIntoComposerSegments("Inspect @AGENTS.md")).toEqual([
      { type: "text", text: "Inspect @AGENTS.md" },
    ]);
  });

  it("keeps newlines around mention tokens", () => {
    expect(splitPromptIntoComposerSegments("one\n@src/index.ts \ntwo")).toEqual([
      { type: "text", text: "one\n" },
      { type: "mention", path: "src/index.ts" },
      { type: "text", text: " \ntwo" },
    ]);
  });

  it("keeps inline terminal context placeholders at their prompt positions", () => {
    expect(
      splitPromptIntoComposerSegments(
        `Inspect ${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}@AGENTS.md please`,
      ),
    ).toEqual([
      { type: "text", text: "Inspect " },
      { type: "terminal-context", context: null },
      { type: "mention", path: "AGENTS.md" },
      { type: "text", text: " please" },
    ]);
  });

  it("keeps inline skill placeholders at their prompt positions", () => {
    expect(
      splitPromptIntoComposerSegments(
        `Use ${INLINE_SKILL_PLACEHOLDER}${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}@AGENTS.md`,
        [],
        [
          {
            id: "skill-1",
            provider: "codex",
            name: "review-pr",
            path: "/skills/review-pr",
            description: null,
          },
        ],
      ),
    ).toEqual([
      { type: "text", text: "Use " },
      {
        type: "skill",
        skill: {
          id: "skill-1",
          provider: "codex",
          name: "review-pr",
          path: "/skills/review-pr",
          description: null,
        },
      },
      { type: "terminal-context", context: null },
      { type: "text", text: "@AGENTS.md" },
    ]);
  });

  it("emits null skill segments when bindings are missing", () => {
    expect(splitPromptIntoComposerSegments(`Use ${INLINE_SKILL_PLACEHOLDER}`)).toEqual([
      { type: "text", text: "Use " },
      { type: "skill", skill: null },
    ]);
  });
});
