import { type CodexSkillSummary, type ProviderTurnSkillReference } from "@t3tools/contracts";

export interface ComposerSkillDraft {
  id: string;
  provider: "codex";
  name: string;
  path: string;
  description: string | null;
}

export const INLINE_SKILL_PLACEHOLDER = "\uE000";
const SKILL_TOKEN_REGEX = /(^|\s)\$([^\s$]+)(?=\s|$)/g;

export function countInlineSkillPlaceholders(prompt: string): number {
  let count = 0;
  for (const char of prompt) {
    if (char === INLINE_SKILL_PLACEHOLDER) {
      count += 1;
    }
  }
  return count;
}

export function ensureInlineSkillPlaceholders(prompt: string, skillCount: number): string {
  const missingCount = skillCount - countInlineSkillPlaceholders(prompt);
  if (missingCount <= 0) {
    return prompt;
  }
  return `${INLINE_SKILL_PLACEHOLDER.repeat(missingCount)}${prompt}`;
}

function isInlineSkillBoundaryWhitespace(char: string | undefined): boolean {
  return char === undefined || char === " " || char === "\n" || char === "\t" || char === "\r";
}

export function insertInlineSkillPlaceholder(
  prompt: string,
  cursorInput: number,
): { prompt: string; cursor: number; skillIndex: number } {
  const cursor = Math.max(0, Math.min(prompt.length, Math.floor(cursorInput)));
  const needsLeadingSpace = !isInlineSkillBoundaryWhitespace(prompt[cursor - 1]);
  const replacement = `${needsLeadingSpace ? " " : ""}${INLINE_SKILL_PLACEHOLDER} `;
  const rangeEnd = prompt[cursor] === " " ? cursor + 1 : cursor;
  return {
    prompt: `${prompt.slice(0, cursor)}${replacement}${prompt.slice(rangeEnd)}`,
    cursor: cursor + replacement.length,
    skillIndex: countInlineSkillPlaceholders(prompt.slice(0, cursor)),
  };
}

export function replaceInlineSkillToken(
  prompt: string,
  rangeStartInput: number,
  rangeEndInput: number,
): { prompt: string; cursor: number; skillIndex: number } {
  const rangeStart = Math.max(0, Math.min(prompt.length, Math.floor(rangeStartInput)));
  const rangeEnd = Math.max(rangeStart, Math.min(prompt.length, Math.floor(rangeEndInput)));
  const replacement = `${INLINE_SKILL_PLACEHOLDER} `;
  const effectiveRangeEnd = prompt[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
  return {
    prompt: `${prompt.slice(0, rangeStart)}${replacement}${prompt.slice(effectiveRangeEnd)}`,
    cursor: rangeStart + replacement.length,
    skillIndex: countInlineSkillPlaceholders(prompt.slice(0, rangeStart)),
  };
}

export function removeInlineSkillPlaceholder(
  prompt: string,
  skillIndex: number,
): { prompt: string; cursor: number } {
  if (skillIndex < 0) {
    return { prompt, cursor: prompt.length };
  }

  let placeholderIndex = 0;
  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== INLINE_SKILL_PLACEHOLDER) {
      continue;
    }
    if (placeholderIndex === skillIndex) {
      return {
        prompt: prompt.slice(0, index) + prompt.slice(index + 1),
        cursor: index,
      };
    }
    placeholderIndex += 1;
  }

  return { prompt, cursor: prompt.length };
}

export function stripInlineSkillPlaceholders(prompt: string): string {
  return prompt.replaceAll(INLINE_SKILL_PLACEHOLDER, "");
}

function resolveLiveSkillName(
  skill: Pick<ComposerSkillDraft, "name" | "path">,
  liveNameByPath: ReadonlyMap<string, string>,
): string {
  return liveNameByPath.get(skill.path) ?? skill.name;
}

function countSkillTokens(text: string): number {
  let count = 0;
  for (const _match of text.matchAll(SKILL_TOKEN_REGEX)) {
    count += 1;
  }
  return count;
}

export function materializeInlineSkillPrompt(input: {
  prompt: string;
  skills: ReadonlyArray<Pick<ComposerSkillDraft, "name" | "path">>;
  liveSkills?: ReadonlyArray<Pick<CodexSkillSummary, "name" | "path">>;
}): { text: string; skillReferences: ProviderTurnSkillReference[] } {
  const { prompt, skills, liveSkills = [] } = input;
  const liveNameByPath = new Map(liveSkills.map((skill) => [skill.path, skill.name]));
  let nextSkillIndex = 0;
  let nextTokenIndex = 0;
  let cursor = 0;
  let text = "";
  const skillReferences: ProviderTurnSkillReference[] = [];

  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== INLINE_SKILL_PLACEHOLDER) {
      continue;
    }
    const textChunk = prompt.slice(cursor, index);
    text += textChunk;
    nextTokenIndex += countSkillTokens(textChunk);
    const skill = skills[nextSkillIndex] ?? null;
    nextSkillIndex += 1;
    cursor = index + 1;
    if (!skill) {
      continue;
    }
    const resolvedName = resolveLiveSkillName(skill, liveNameByPath);
    text += `$${resolvedName}`;
    skillReferences.push({
      provider: "codex",
      name: resolvedName,
      path: skill.path,
      tokenIndex: nextTokenIndex,
    });
    nextTokenIndex += 1;
  }

  text += prompt.slice(cursor);

  return {
    text,
    skillReferences,
  };
}

export function materializeInlineSkillCursor(input: {
  prompt: string;
  cursor: number;
  skills: ReadonlyArray<Pick<ComposerSkillDraft, "name" | "path">>;
  liveSkills?: ReadonlyArray<Pick<CodexSkillSummary, "name" | "path">>;
}): number {
  const boundedCursor = Math.max(0, Math.min(input.prompt.length, Math.floor(input.cursor)));
  return materializeInlineSkillPrompt({
    prompt: input.prompt.slice(0, boundedCursor),
    skills: input.skills,
    ...(input.liveSkills ? { liveSkills: input.liveSkills } : {}),
  }).text.length;
}
