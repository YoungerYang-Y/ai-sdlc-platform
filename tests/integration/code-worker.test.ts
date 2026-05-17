import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceManager } from "../../workers/code-worker/src/workspace.js";
import { resetCliCache } from "../../workers/code-worker/src/cli-resolver.js";
import { FileSystemArtifactStore } from "../../packages/artifact/src/index.js";
import { CliRuntime } from "../../packages/runtime/src/index.js";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const MOCK_CLI = resolve(__dirname, "../fixtures/mock-cli.sh");
const originalPath = process.env.PATH;

function createTestRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "integ-repo-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "index.ts"), "export const x = 1;");
  writeFileSync(join(dir, "package.json"), '{"scripts":{"test":"echo ok"}}');
  execSync("git add . && git commit -m init", { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("Code Worker Integration", () => {
  let testRepo: string;
  let basePath: string;
  let artifactPath: string;
  let workspace: WorkspaceManager;
  let artifactStore: FileSystemArtifactStore;
  let mockBinDir: string;

  beforeEach(() => {
    testRepo = createTestRepo();
    basePath = mkdtempSync(join(tmpdir(), "integ-ws-"));
    artifactPath = mkdtempSync(join(tmpdir(), "integ-art-"));
    workspace = new WorkspaceManager(basePath, { allowFile: true });
    artifactStore = new FileSystemArtifactStore({ basePath: artifactPath });

    // Setup mock CLI in PATH as "kiro"
    mockBinDir = mkdtempSync(join(tmpdir(), "integ-bin-"));
    execSync(`cp ${MOCK_CLI} ${join(mockBinDir, "kiro")}`);
    chmodSync(join(mockBinDir, "kiro"), 0o755);
    process.env.PATH = `${mockBinDir}:/usr/bin:/bin`;
    resetCliCache();
  });

  afterEach(async () => {
    process.env.PATH = originalPath;
    resetCliCache();
    await rm(testRepo, { recursive: true, force: true });
    await rm(basePath, { recursive: true, force: true });
    await rm(artifactPath, { recursive: true, force: true });
    await rm(mockBinDir, { recursive: true, force: true });
  });

  it("code step: acquires workspace, runs CLI, extracts git diff", async () => {
    const ws = await workspace.acquire({ workflowRunId: "wf-integ-1", workDir: testRepo });
    expect(ws.baseCommit).toMatch(/^[0-9a-f]{40}$/);

    // Simulate CLI execution (mock-cli.sh creates generated.ts)
    const runtime = new CliRuntime();
    const session = await runtime.createSession({ runtimeType: "cli", workDir: ws.path, timeout: 10000 });
    const result = await session.execute({ command: [join(mockBinDir, "kiro"), "implement feature X"] });
    await session.destroy();

    expect(result.status).toBe("success");
    expect(existsSync(join(ws.path, "generated.ts"))).toBe(true);

    // Extract git diff (same logic as handler)
    const diffResult = execSync("git diff HEAD", { cwd: ws.path, encoding: "utf-8" });
    const untrackedResult = execSync("git ls-files --others --exclude-standard", { cwd: ws.path, encoding: "utf-8" });
    expect(untrackedResult.trim()).toContain("generated.ts");

    // Include untracked in diff
    execSync("git add -N generated.ts", { cwd: ws.path, stdio: "ignore" });
    const fullDiff = execSync("git diff HEAD", { cwd: ws.path, encoding: "utf-8" });
    execSync("git reset HEAD -- generated.ts", { cwd: ws.path, stdio: "ignore" });

    expect(fullDiff).toContain("generated.ts");
    expect(fullDiff).toContain("hello");

    // Save artifact
    const ref = await artifactStore.write({
      content: fullDiff,
      metadata: { artifactType: "patch", workflowRunId: "wf-integ-1", taskRunId: "t1", filename: "patch.diff", mimeType: "text/x-diff", sizeBytes: Buffer.byteLength(fullDiff) },
    });
    expect(ref).toContain("patch");
  });

  it("verify step: reuses workspace, runs verify command", async () => {
    // Setup: acquire and add a file (simulating code step output)
    await workspace.acquire({ workflowRunId: "wf-integ-2", workDir: testRepo });
    writeFileSync(join(testRepo, "new.ts"), "export const y = 2;");

    // Verify step: acquire same workspace (idempotent)
    const ws = await workspace.acquire({ workflowRunId: "wf-integ-2", workDir: testRepo });
    expect(existsSync(join(ws.path, "new.ts"))).toBe(true); // code output preserved

    // Run verify command
    const runtime = new CliRuntime();
    const session = await runtime.createSession({ runtimeType: "cli", workDir: ws.path, timeout: 10000 });
    const result = await session.execute({ command: ["sh", "-c", "echo ok"] });
    await session.destroy();

    expect(result.status).toBe("success");
    expect(result.stdout.trim()).toBe("ok");
  });

  it("workspace reset cleans up for code retry", async () => {
    await workspace.acquire({ workflowRunId: "wf-integ-3", workDir: testRepo });
    writeFileSync(join(testRepo, "dirty.ts"), "should be cleaned");

    await workspace.reset("wf-integ-3");
    expect(existsSync(join(testRepo, "dirty.ts"))).toBe(false);

    // Re-acquire still works
    const ws = await workspace.acquire({ workflowRunId: "wf-integ-3", workDir: testRepo });
    expect(existsSync(join(ws.path, "index.ts"))).toBe(true);
  });

  it("workspace release cleans cloned directory", async () => {
    const ws = await workspace.acquire({ workflowRunId: "wf-integ-4", repository: `file://${testRepo}`, branch: "master" });
    expect(existsSync(ws.path)).toBe(true);

    await workspace.release("wf-integ-4");
    expect(existsSync(ws.path)).toBe(false);
  });
});
