import { describe, it, expect } from "vitest";
import { CliRuntime } from "../src/index.js";

describe("CliRuntime", () => {
  it("executes a command and returns stdout", async () => {
    const runtime = new CliRuntime();
    const session = await runtime.createSession({ runtimeType: "cli", workDir: "/tmp", timeout: 5000 });
    const result = await session.execute({ command: ["echo", "hello"] });
    expect(result.status).toBe("success");
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThan(0);
    await session.destroy();
  });

  it("returns failed for non-zero exit code", async () => {
    const runtime = new CliRuntime();
    const session = await runtime.createSession({ runtimeType: "cli", workDir: "/tmp", timeout: 5000 });
    const result = await session.execute({ command: ["sh", "-c", "exit 1"] });
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
    await session.destroy();
  });

  it("returns timeout when command exceeds timeoutMs", async () => {
    const runtime = new CliRuntime();
    const session = await runtime.createSession({ runtimeType: "cli", workDir: "/tmp", timeout: 5000 });
    const result = await session.execute({ command: ["sleep", "10"], timeoutMs: 100 });
    expect(result.status).toBe("timeout");
    await session.destroy();
  });

  it("supports cancellation via AbortSignal", async () => {
    const ac = new AbortController();
    const runtime = new CliRuntime();
    const session = await runtime.createSession({ runtimeType: "cli", workDir: "/tmp", timeout: 5000, abortSignal: ac.signal });
    setTimeout(() => ac.abort(), 50);
    const result = await session.execute({ command: ["sleep", "10"] });
    expect(result.status).toBe("cancelled");
    await session.destroy();
  });
});
