import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceManager } from "../src/workspace.js";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "ws-test-repo-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "file.txt"), "hello");
  execSync("git add . && git commit -m init", { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("WorkspaceManager", () => {
  let basePath: string;
  let wm: WorkspaceManager;
  let testRepo: string;

  beforeEach(() => {
    basePath = mkdtempSync(join(tmpdir(), "ws-test-base-"));
    wm = new WorkspaceManager(basePath, { allowFile: true });
    testRepo = createTestRepo();
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
    await rm(testRepo, { recursive: true, force: true });
  });

  it("acquire local mode returns workDir directly", async () => {
    const result = await wm.acquire({ workflowRunId: "wf-1", workDir: testRepo });
    expect(result.path).toBe(testRepo);
    expect(result.baseCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("acquire clone mode clones to basePath", async () => {
    const result = await wm.acquire({ workflowRunId: "wf-2", repository: `file://${testRepo}`, branch: "master" });
    expect(result.path).toBe(join(basePath, "wf-2"));
    expect(existsSync(join(result.path, "file.txt"))).toBe(true);
  });

  it("acquire is idempotent for same workflowRunId", async () => {
    const r1 = await wm.acquire({ workflowRunId: "wf-3", workDir: testRepo });
    const r2 = await wm.acquire({ workflowRunId: "wf-3", workDir: testRepo });
    expect(r1.path).toBe(r2.path);
  });

  it("reset restores clean state", async () => {
    await wm.acquire({ workflowRunId: "wf-4", workDir: testRepo });
    writeFileSync(join(testRepo, "dirty.txt"), "dirty");
    await wm.reset("wf-4");
    expect(existsSync(join(testRepo, "dirty.txt"))).toBe(false);
  });

  it("release deletes cloned directory", async () => {
    const result = await wm.acquire({ workflowRunId: "wf-5", repository: `file://${testRepo}`, branch: "master" });
    expect(existsSync(result.path)).toBe(true);
    await wm.release("wf-5");
    expect(existsSync(result.path)).toBe(false);
  });

  it("release does not delete local directory", async () => {
    await wm.acquire({ workflowRunId: "wf-6", workDir: testRepo });
    await wm.release("wf-6");
    expect(existsSync(testRepo)).toBe(true);
  });

  it("rejects invalid repository URL", async () => {
    await expect(wm.acquire({ workflowRunId: "wf-7", repository: "../../../etc/passwd" }))
      .rejects.toThrow("Invalid repository URL format");
  });
});
