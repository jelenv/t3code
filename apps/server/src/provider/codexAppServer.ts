import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { type CodexSkillSummary } from "@t3tools/contracts";
import { readCodexAccountSnapshot, type CodexAccountSnapshot } from "./codexAccount";

interface JsonRpcProbeResponse {
  readonly id?: unknown;
  readonly result?: unknown;
  readonly error?: {
    readonly message?: unknown;
  };
}

interface CodexSkillListResponse {
  readonly data?: ReadonlyArray<{
    readonly skills?: ReadonlyArray<{
      readonly name?: unknown;
      readonly path?: unknown;
      readonly description?: unknown;
      readonly enabled?: unknown;
    }>;
  }>;
}

function readErrorMessage(response: JsonRpcProbeResponse): string | undefined {
  return typeof response.error?.message === "string" ? response.error.message : undefined;
}

function normalizeCodexSkillDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function decodeEnabledCodexSkills(response: unknown): CodexSkillSummary[] {
  const decoded = response as CodexSkillListResponse;
  const skillsByPath = new Map<string, CodexSkillSummary>();

  for (const entry of decoded.data ?? []) {
    for (const skill of entry.skills ?? []) {
      if (skill.enabled !== true) {
        continue;
      }
      if (typeof skill.name !== "string" || skill.name.trim().length === 0) {
        continue;
      }
      if (typeof skill.path !== "string" || skill.path.trim().length === 0) {
        continue;
      }
      const normalizedPath = skill.path.trim();
      if (skillsByPath.has(normalizedPath)) {
        continue;
      }
      skillsByPath.set(normalizedPath, {
        name: skill.name.trim(),
        path: normalizedPath,
        description: normalizeCodexSkillDescription(skill.description),
      });
    }
  }

  return [...skillsByPath.values()].toSorted((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }
    return left.path.localeCompare(right.path);
  });
}

export function buildCodexInitializeParams() {
  return {
    clientInfo: {
      name: "t3code_desktop",
      title: "T3 Code Desktop",
      version: "0.1.0",
    },
    capabilities: {
      experimentalApi: true,
    },
  } as const;
}

export function killCodexChildProcess(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to direct kill when taskkill is unavailable.
    }
  }

  child.kill();
}

async function probeCodexAppServer<Result>(input: {
  readonly binaryPath: string;
  readonly homePath?: string;
  readonly signal?: AbortSignal;
  readonly requestId: number;
  readonly requestMethod: string;
  readonly requestParams: Record<string, unknown>;
  readonly label: string;
  readonly decodeResult: (result: unknown) => Result;
}): Promise<Result> {
  return await new Promise((resolve, reject) => {
    const child = spawn(input.binaryPath, ["app-server"], {
      env: {
        ...process.env,
        ...(input.homePath ? { CODEX_HOME: input.homePath } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    const output = readline.createInterface({ input: child.stdout });

    let completed = false;

    const cleanup = () => {
      output.removeAllListeners();
      output.close();
      child.removeAllListeners();
      if (!child.killed) {
        killCodexChildProcess(child);
      }
    };

    const finish = (callback: () => void) => {
      if (completed) return;
      completed = true;
      cleanup();
      callback();
    };

    const fail = (error: unknown) =>
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error(`Codex ${input.label} probe failed: ${String(error)}.`),
        ),
      );

    if (input.signal?.aborted) {
      fail(new Error(`Codex ${input.label} probe aborted.`));
      return;
    }
    input.signal?.addEventListener("abort", () =>
      fail(new Error(`Codex ${input.label} probe aborted.`)),
    );

    const writeMessage = (message: unknown) => {
      if (!child.stdin.writable) {
        fail(new Error("Cannot write to codex app-server stdin."));
        return;
      }

      child.stdin.write(`${JSON.stringify(message)}
`);
    };

    output.on("line", (line) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        fail(new Error(`Received invalid JSON from codex app-server during ${input.label} probe.`));
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        return;
      }

      const response = parsed as JsonRpcProbeResponse;
      if (response.id === 1) {
        const errorMessage = readErrorMessage(response);
        if (errorMessage) {
          fail(new Error(`initialize failed: ${errorMessage}`));
          return;
        }

        writeMessage({ method: "initialized" });
        writeMessage({
          id: input.requestId,
          method: input.requestMethod,
          params: input.requestParams,
        });
        return;
      }

      if (response.id === input.requestId) {
        const errorMessage = readErrorMessage(response);
        if (errorMessage) {
          fail(new Error(`${input.requestMethod} failed: ${errorMessage}`));
          return;
        }

        finish(() => resolve(input.decodeResult(response.result)));
      }
    });

    child.once("error", fail);
    child.once("exit", (code, signal) => {
      if (completed) return;
      fail(
        new Error(
          `codex app-server exited before probe completed (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        ),
      );
    });

    writeMessage({
      id: 1,
      method: "initialize",
      params: buildCodexInitializeParams(),
    });
  });
}

export async function probeCodexAccount(input: {
  readonly binaryPath: string;
  readonly homePath?: string;
  readonly signal?: AbortSignal;
}): Promise<CodexAccountSnapshot> {
  return await probeCodexAppServer({
    ...input,
    requestId: 2,
    requestMethod: "account/read",
    requestParams: {},
    label: "account",
    decodeResult: readCodexAccountSnapshot,
  });
}

export async function probeCodexSkills(input: {
  readonly binaryPath: string;
  readonly homePath?: string;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
}): Promise<CodexSkillSummary[]> {
  return await probeCodexAppServer({
    ...input,
    requestId: 3,
    requestMethod: "skills/list",
    requestParams: input.cwd ? { cwds: [input.cwd] } : {},
    label: "skills",
    decodeResult: decodeEnabledCodexSkills,
  });
}
