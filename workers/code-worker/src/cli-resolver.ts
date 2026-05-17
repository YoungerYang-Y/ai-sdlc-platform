import { isInPath } from "./utils.js";

export interface CliResolution {
  name: string;
  command: string[];
}

const CLI_CONFIGS: Record<string, { check: string; command: string[] }> = {
  kiro: { check: "kiro-cli", command: ["kiro-cli", "chat", "--no-interactive", "--trust-all-tools"] },
  codex: { check: "codex", command: ["codex", "--quiet", "--task"] },
};

let cached = new Map<string, CliResolution>();

export async function resolveCliCommand(preferred: string = "kiro"): Promise<CliResolution> {
  const hit = cached.get(preferred);
  if (hit) return hit;

  const order = preferred === "kiro" ? ["kiro", "codex"] : ["codex", "kiro"];

  for (const name of order) {
    const config = CLI_CONFIGS[name]!;
    if (await isInPath(config.check)) {
      const resolution: CliResolution = { name, command: config.command };
      cached.set(preferred, resolution);
      return resolution;
    }
  }

  throw new Error("NO_CLI_AVAILABLE: neither kiro nor codex found in PATH");
}

export function resetCliCache(): void {
  cached = new Map();
}
