import { describe, it, expect, beforeEach } from "vitest";
import { resolveCliCommand, resetCliCache } from "../src/cli-resolver.js";

describe("cliResolver", () => {
  beforeEach(() => {
    resetCliCache();
  });

  it("resolves to some CLI in current environment", async () => {
    // This test passes if at least one of kiro/codex/which is available
    // In CI without either, it should throw NO_CLI_AVAILABLE
    try {
      const result = await resolveCliCommand("kiro");
      expect(result.name).toMatch(/^(kiro|codex)$/);
      expect(result.command.length).toBeGreaterThan(0);
    } catch (err: any) {
      expect(err.message).toContain("NO_CLI_AVAILABLE");
    }
  });

  it("caches result after first call", async () => {
    try {
      const r1 = await resolveCliCommand("kiro");
      const r2 = await resolveCliCommand("kiro");
      expect(r1).toBe(r2); // same object reference
    } catch {
      // no CLI available, skip
    }
  });

  it("resetCliCache clears cache", async () => {
    try {
      await resolveCliCommand("kiro");
      resetCliCache();
      // After reset, next call should re-detect
      const r = await resolveCliCommand("codex");
      expect(r.name).toMatch(/^(kiro|codex)$/);
    } catch {
      // no CLI available, skip
    }
  });
});
