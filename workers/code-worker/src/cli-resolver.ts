import { isInPath } from "./utils.js";

export interface CliResolution {
  name: string;
  command: string[];
  requirementArgStyle: "append" | "flag";
}

const CLI_CONFIGS: Record<string, { check: string; command: string[]; requirementArgStyle: "append" | "flag" }> = {
  kiro: { check: "kiro", command: ["kiro", "chat", "--no-interactive", "--trust-all-tools"], requirementArgStyle: "append" },
  codex: { check: "codex", command: ["codex", "--quiet", "--task"], requirementArgStyle: "append" },
};

let cached: CliResolution | null = null;

export async function resolveCliCommand(preferred: string = "kiro"): Promise<CliResolution> {
  if (cached) return cached;

  const order = preferred === "kiro" ? ["kiro", "codex"] : ["codex", "kiro"];

  for (const name of order) {
    const config = CLI_CONFIGS[name]!;
    if (await isInPath(config.check)) {
      cached = { name, command: config.command, requirementArgStyle: config.requirementArgStyle };
      return cached;
    }
  }

  throw new Error("NO_CLI_AVAILABLE: neither kiro nor codex found in PATH");
}

export function resetCliCache(): void {
  cached = null;
}
