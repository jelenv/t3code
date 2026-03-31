import { describe, expect, it } from "vitest";

import { decodeEnabledCodexSkills } from "./codexAppServer";

describe("decodeEnabledCodexSkills", () => {
  it("keeps enabled skills, normalizes descriptions, deduplicates by path, and sorts", () => {
    expect(
      decodeEnabledCodexSkills({
        data: [
          {
            skills: [
              {
                name: "z-last",
                path: "/skills/z-last",
                description: "  Last skill  ",
                enabled: true,
              },
              {
                name: "alpha",
                path: "/skills/alpha",
                description: "",
                enabled: true,
              },
              {
                name: "disabled",
                path: "/skills/disabled",
                description: "ignored",
                enabled: false,
              },
              {
                name: "duplicate",
                path: "/skills/alpha",
                description: "ignored",
                enabled: true,
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        name: "alpha",
        path: "/skills/alpha",
        description: null,
      },
      {
        name: "z-last",
        path: "/skills/z-last",
        description: "Last skill",
      },
    ]);
  });
});
