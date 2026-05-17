import { spawn } from "node:child_process";

export function isInPath(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("which", [cmd], { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
