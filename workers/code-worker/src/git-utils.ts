import { spawn } from "node:child_process";

export const DIFF_EXCLUDE = ["node_modules", "dist", "build", ".next", "__pycache__", ".venv", "vendor", "target"];

export async function gitDiff(cwd: string): Promise<string> {
  const excludeArgs = DIFF_EXCLUDE.map(p => `:(exclude)${p}`);
  const tracked = await execOutput("git", ["diff", "HEAD", "--", ".", ...excludeArgs], cwd);
  const untracked = await execOutput("git", ["ls-files", "--others", "--exclude-standard"], cwd);
  const relevantUntracked = untracked.trim().split("\n").filter(f => f && !DIFF_EXCLUDE.some(ex => f.startsWith(ex + "/")));

  let patch = tracked;
  if (relevantUntracked.length > 0) {
    await execVoid("git", ["add", "-N", ...relevantUntracked], cwd);
    patch = await execOutput("git", ["diff", "HEAD", "--", ".", ...excludeArgs], cwd);
    await execVoid("git", ["reset", "HEAD", "--", ...relevantUntracked], cwd);
  }
  return patch;
}

export function execOutput(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.on("close", () => resolve(stdout));
    proc.on("error", () => resolve(""));
  });
}

export function execVoid(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, stdio: "ignore" });
    proc.on("close", () => resolve());
    proc.on("error", () => resolve());
  });
}
