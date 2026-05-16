import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { FileSystemArtifactStore } from "../src/index.js";

const TEST_DIR = "/tmp/artifact-test-" + Date.now();

describe("FileSystemArtifactStore", () => {
  let store: FileSystemArtifactStore;

  beforeEach(() => { store = new FileSystemArtifactStore({ basePath: TEST_DIR }); });
  afterEach(async () => { await rm(TEST_DIR, { recursive: true, force: true }); });

  it("writes and reads an artifact", async () => {
    const ref = await store.write({
      content: "diff --git a/file.ts",
      metadata: { artifactType: "patch", workflowRunId: "wf1", taskRunId: "t1", filename: "patch.diff", mimeType: "text/x-diff", sizeBytes: 20 },
    });

    expect(ref).toBe("patch/wf1/t1/patch.diff");
    const { data, metadata } = await store.read(ref);
    expect(data.toString()).toBe("diff --git a/file.ts");
    expect(metadata.artifactType).toBe("patch");
  });

  it("lists artifacts by query", async () => {
    await store.write({ content: "p1", metadata: { artifactType: "patch", workflowRunId: "wf1", taskRunId: "t1", filename: "a.diff", mimeType: "text/plain", sizeBytes: 2 } });
    await store.write({ content: "l1", metadata: { artifactType: "log", workflowRunId: "wf1", taskRunId: "t1", filename: "out.log", mimeType: "text/plain", sizeBytes: 2 } });
    await store.write({ content: "p2", metadata: { artifactType: "patch", workflowRunId: "wf1", taskRunId: "t2", filename: "b.diff", mimeType: "text/plain", sizeBytes: 2 } });

    const patches = await store.list({ taskRunId: "t1", artifactType: "patch" });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toContain("a.diff");

    const allT1 = await store.list({ taskRunId: "t1" });
    expect(allT1).toHaveLength(2);
  });

  it("deletes an artifact", async () => {
    const ref = await store.write({ content: "x", metadata: { artifactType: "log", workflowRunId: "wf1", filename: "x.log", mimeType: "text/plain", sizeBytes: 1 } });
    await store.delete(ref);
    const list = await store.list({ workflowRunId: "wf1" });
    expect(list).toHaveLength(0);
  });
});
