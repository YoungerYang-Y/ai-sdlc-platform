import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveCliCommand, resetCliCache } from "../src/cli-resolver.js";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cliResolver", () => {
  let mockBinDir: string;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    resetCliCache();
    mockBinDir = mkdtempSync(join(tmpdir(), "cli-resolver-test-"));
  });

  afterEach(async () => {
    process.env.PATH = originalPath;
    resetCliCache();
    await rm(mockBinDir, { recursive: true, force: true });
  });

  it("detects kiro when available in PATH", async () => {
    writeFileSync(join(mockBinDir, "kiro"), "#!/bin/sh\nexit 0");
    chmodSync(join(mockBinDir, "kiro"), 0o755);
    process.env.PATH = `${mockBinDir}:${originalPath}`;

    const result = await resolveCliCommand("kiro");
    expect(result.name).toBe("kiro");
    expect(result.command[0]).toBe("kiro");
  });

  it("falls back to codex when kiro not available", async () => {
    writeFileSync(join(mockBinDir, "codex"), "#!/bin/sh\nexit 0");
    chmodSync(join(mockBinDir, "codex"), 0o755);
    process.env.PATH = `${mockBinDir}:/usr/bin`; // only codex + system utils, no kiro

    const result = await resolveCliCommand("kiro");
    expect(result.name).toBe("codex");
  });

  it("throws when neither CLI is available", async () => {
    process.env.PATH = "/usr/bin"; // system utils only, no kiro or codex

    await expect(resolveCliCommand("kiro")).rejects.toThrow("NO_CLI_AVAILABLE");
  });

  it("caches result after first call", async () => {
    writeFileSync(join(mockBinDir, "kiro"), "#!/bin/sh\nexit 0");
    chmodSync(join(mockBinDir, "kiro"), 0o755);
    process.env.PATH = `${mockBinDir}:${originalPath}`;

    const r1 = await resolveCliCommand("kiro");
    const r2 = await resolveCliCommand("kiro");
    expect(r1).toBe(r2);
  });

  it("resetCliCache clears cache", async () => {
    writeFileSync(join(mockBinDir, "codex"), "#!/bin/sh\nexit 0");
    chmodSync(join(mockBinDir, "codex"), 0o755);
    process.env.PATH = `${mockBinDir}:/usr/bin`;

    const r1 = await resolveCliCommand("codex");
    expect(r1.name).toBe("codex");

    resetCliCache();
    const r2 = await resolveCliCommand("codex");
    expect(r2.name).toBe("codex");
    expect(r2).not.toBe(r1);
  });
});
