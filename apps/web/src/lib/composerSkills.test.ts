import { describe, expect, it } from "vitest";

import {
  INLINE_SKILL_PLACEHOLDER,
  materializeInlineSkillCursor,
  materializeInlineSkillPrompt,
  replaceInlineSkillToken,
} from "./composerSkills";

describe("replaceInlineSkillToken", () => {
  it("replaces a partial $skill token with a placeholder chip", () => {
    const prompt = "$revi";
    const replaced = replaceInlineSkillToken(prompt, 0, prompt.length);

    expect(replaced).toEqual({
      prompt: `${INLINE_SKILL_PLACEHOLDER} `,
      cursor: 2,
      skillIndex: 0,
    });
  });

  it("consumes a trailing space after the active token", () => {
    const prompt = "use $revi next";
    const replaced = replaceInlineSkillToken(prompt, 4, 9);

    expect(replaced.prompt).toBe(`use ${INLINE_SKILL_PLACEHOLDER} next`);
    expect(replaced.cursor).toBe(6);
    expect(replaced.skillIndex).toBe(0);
  });
});

describe("materializeInlineSkillPrompt", () => {
  it("tracks chip token indices alongside typed $skill tokens", () => {
    const materialized = materializeInlineSkillPrompt({
      prompt: `use $typed ${INLINE_SKILL_PLACEHOLDER} then ${INLINE_SKILL_PLACEHOLDER}`,
      skills: [
        {
          name: "review-pr",
          path: "/skills/review-pr",
        },
        {
          name: "repo-scout",
          path: "/skills/repo-scout",
        },
      ],
      liveSkills: [
        {
          name: "review-pr-v2",
          path: "/skills/review-pr",
        },
      ],
    });

    expect(materialized.text).toBe("use $typed $review-pr-v2 then $repo-scout");
    expect(materialized.skillReferences).toEqual([
      {
        provider: "codex",
        name: "review-pr-v2",
        path: "/skills/review-pr",
        tokenIndex: 1,
      },
      {
        provider: "codex",
        name: "repo-scout",
        path: "/skills/repo-scout",
        tokenIndex: 2,
      },
    ]);
  });

  it("remaps collapsed cursor positions after placeholder expansion", () => {
    const prompt = `use ${INLINE_SKILL_PLACEHOLDER} next`;

    expect(
      materializeInlineSkillCursor({
        prompt,
        cursor: prompt.length,
        skills: [
          {
            name: "review-pr",
            path: "/skills/review-pr",
          },
        ],
      }),
    ).toBe("use $review-pr next".length);
  });
});
