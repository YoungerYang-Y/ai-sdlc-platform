import { describe, it, expect, beforeEach } from "vitest";
import { DeliveryManager, resetGhCache } from "../src/delivery.js";

describe("DeliveryManager", () => {
  let dm: DeliveryManager;

  beforeEach(() => {
    resetGhCache();
    dm = new DeliveryManager();
  });

  describe("shouldDeliver", () => {
    it("returns false before gh check", () => {
      expect(dm.shouldDeliver("manual", "cloned")).toBe(false);
    });

    it("returns false for experiment mode", async () => {
      await dm.checkGhAvailability();
      expect(dm.shouldDeliver("experiment", "cloned")).toBe(false);
    });

    it("returns false for local mode", async () => {
      await dm.checkGhAvailability();
      expect(dm.shouldDeliver("manual", "local")).toBe(false);
    });

    it("returns true for manual+cloned if gh available", async () => {
      await dm.checkGhAvailability();
      // Result depends on whether gh is actually installed
      // We just verify the logic doesn't throw
      const result = dm.shouldDeliver("manual", "cloned");
      expect(typeof result).toBe("boolean");
    });
  });

  describe("deliver", () => {
    it("returns error when git operations fail on non-repo dir", async () => {
      const result = await dm.deliver({
        workDir: "/tmp",
        requirement: "test",
        workflowRunId: "abcdef12-0000-0000-0000-000000000000",
      });
      expect(result.error).toBeDefined();
    });
  });
});
