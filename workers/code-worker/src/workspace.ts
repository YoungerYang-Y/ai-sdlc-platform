import { spawn } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO_URL_PATTERN = /^(https?:\/\/|git@|ssh:\/\/)/;
const REPO_URL_PATTERN_WITH_FILE = /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export interface WorkspaceEntry {
  path: string;
  mode: "local" | "cloned";
  baseCommit: string;
}

export interface AcquireParams {
  workflowRunId: string;
  repository?: string;
  branch?: string;
  workDir?: string;
}

export class WorkspaceManager {
  private basePath: string;
  private allowFile: boolean;
  private entries = new Map<string, WorkspaceEntry>();

  constructor(basePath?: string, opts?: { allowFile?: boolean }) {
    this.basePath = basePath ?? process.env.WORKSPACE_BASE_PATH ?? "/tmp/ai-sdlc-workspaces";
    this.allowFile = opts?.allowFile ?? false;
  }

  async cleanOrphans(): Promise<void> {
    if (!existsSync(this.basePath)) return;
    const now = Date.now();
    for (const name of readdirSync(this.basePath)) {
      const dir = join(this.basePath, name);
      try {
        const stat = statSync(dir);
        if (stat.isDirectory() && now - stat.mtimeMs > ORPHAN_MAX_AGE_MS) {
          await rm(dir, { recursive: true, force: true });
        }
      } catch { /* ignore */ }
    }
  }

  /**
   * Acquire workspace for a workflow run. Idempotent: returns existing directory if already acquired.
   * Callers must call reset() before acquire() when retrying a code step (to restore clean state).
   * Verify step should NOT reset — it operates on code step's output.
   */
  async acquire(params: AcquireParams): Promise<{ path: string; baseCommit: string }> {
    const existing = this.entries.get(params.workflowRunId);
    if (existing) {
      if (!existsSync(existing.path)) {
        this.entries.delete(params.workflowRunId);
      } else {
        return { path: existing.path, baseCommit: existing.baseCommit };
      }
    }

    if (params.workDir) {
      const baseCommit = await this.getHeadCommit(params.workDir);
      const entry: WorkspaceEntry = { path: params.workDir, mode: "local", baseCommit };
      this.entries.set(params.workflowRunId, entry);
      return { path: entry.path, baseCommit };
    }

    if (!params.repository) throw new Error("Either repository or workDir must be provided");
    const pattern = this.allowFile ? REPO_URL_PATTERN_WITH_FILE : REPO_URL_PATTERN;
    if (!pattern.test(params.repository)) {
      throw new Error(`Invalid repository URL format: ${params.repository}`);
    }

    const destPath = join(this.basePath, params.workflowRunId);
    await mkdir(this.basePath, { recursive: true });

    const branch = params.branch ?? "main";
    await this.exec("git", ["clone", "--branch", branch, "--depth", "1", params.repository, destPath]);

    const baseCommit = await this.getHeadCommit(destPath);
    const entry: WorkspaceEntry = { path: destPath, mode: "cloned", baseCommit };
    this.entries.set(params.workflowRunId, entry);
    return { path: entry.path, baseCommit };
  }

  async reset(workflowRunId: string): Promise<void> {
    const entry = this.entries.get(workflowRunId);
    if (!entry) return;
    await this.exec("git", ["reset", "--hard", entry.baseCommit], entry.path);
    await this.exec("git", ["clean", "-fd"], entry.path);
  }

  async release(workflowRunId: string): Promise<void> {
    const entry = this.entries.get(workflowRunId);
    if (!entry) return;
    this.entries.delete(workflowRunId);
    if (entry.mode === "cloned") {
      await rm(entry.path, { recursive: true, force: true });
    }
  }

  private async getHeadCommit(cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => { stdout += d; });
      proc.stderr?.on("data", (d) => { stderr += d; });
      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(`Repository has no commits (git rev-parse HEAD failed). Ensure at least one commit exists.`));
        else resolve(stdout.trim());
      });
      proc.on("error", reject);
    });
  }

  private exec(cmd: string, args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d; });
      proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} failed (${code}): ${stderr}`)));
      proc.on("error", reject);
    });
  }

  private execOutput(cmd: string, args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      proc.stdout.on("data", (d) => { stdout += d; });
      proc.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${cmd} failed (${code})`)));
      proc.on("error", reject);
    });
  }
}
