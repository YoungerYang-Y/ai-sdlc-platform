import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LeaseManager } from "../src/framework/lease-manager.js";
import { silentLogger } from "../src/testing/index.js";

describe("LeaseManager", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("sends heartbeat at leaseDuration / heartbeatFactor interval", async () => {
    const heartbeatFn = vi.fn().mockResolvedValue({ leaseDurationMs: 300000 });
    const scheduler = { heartbeat: heartbeatFn } as any;

    const manager = new LeaseManager({
      attemptId: "a1",
      leaseToken: "tok",
      leaseDurationMs: 300000,
      heartbeatFactor: 3,
      maxFailures: 2,
      scheduler,
      logger: silentLogger,
      onExpired: vi.fn(),
    });

    manager.start();
    await vi.advanceTimersByTimeAsync(100000); // 300000/3 = 100000
    expect(heartbeatFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100000);
    expect(heartbeatFn).toHaveBeenCalledTimes(2);
    manager.stop();
  });

  it("calls onExpired after maxFailures consecutive failures", async () => {
    const heartbeatFn = vi.fn().mockRejectedValue(new Error("network error"));
    const onExpired = vi.fn();
    const scheduler = { heartbeat: heartbeatFn } as any;

    const manager = new LeaseManager({
      attemptId: "a1",
      leaseToken: "tok",
      leaseDurationMs: 300000,
      heartbeatFactor: 3,
      maxFailures: 2,
      scheduler,
      logger: silentLogger,
      onExpired,
    });

    manager.start();
    await vi.advanceTimersByTimeAsync(100000); // 1st failure
    expect(onExpired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100000); // 2nd failure → expired
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("resets failure count on successful heartbeat", async () => {
    let callCount = 0;
    const heartbeatFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("fail"));
      return Promise.resolve({ leaseDurationMs: 300000 });
    });
    const onExpired = vi.fn();
    const scheduler = { heartbeat: heartbeatFn } as any;

    const manager = new LeaseManager({
      attemptId: "a1",
      leaseToken: "tok",
      leaseDurationMs: 300000,
      heartbeatFactor: 3,
      maxFailures: 2,
      scheduler,
      logger: silentLogger,
      onExpired,
    });

    manager.start();
    await vi.advanceTimersByTimeAsync(100000); // 1st: fail
    await vi.advanceTimersByTimeAsync(100000); // 2nd: success (resets)
    await vi.advanceTimersByTimeAsync(100000); // 3rd: success
    expect(onExpired).not.toHaveBeenCalled();
    manager.stop();
  });
});
