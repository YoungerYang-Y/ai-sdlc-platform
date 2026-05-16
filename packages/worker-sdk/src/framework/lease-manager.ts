import type { SchedulerClient } from "../client/scheduler-client.js";
import type { Logger } from "../types/interfaces.js";

export interface LeaseManagerConfig {
  attemptId: string;
  leaseToken: string;
  leaseDurationMs: number;
  heartbeatFactor: number;
  maxFailures: number;
  scheduler: SchedulerClient;
  logger: Logger;
  onExpired: () => void;
}

export class LeaseManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private config: LeaseManagerConfig;

  constructor(config: LeaseManagerConfig) {
    this.config = config;
  }

  start(): void {
    const intervalMs = this.config.leaseDurationMs / this.config.heartbeatFactor;
    this.timer = setInterval(() => void this.heartbeat(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async heartbeat(): Promise<void> {
    try {
      await this.config.scheduler.heartbeat({
        attemptId: this.config.attemptId,
        leaseToken: this.config.leaseToken,
      });
      this.failures = 0;
    } catch (err) {
      this.failures++;
      this.config.logger.warn("heartbeat failed", { failures: this.failures, error: String(err) });
      if (this.failures >= this.config.maxFailures || (err as Error).name === "LeaseExpiredError") {
        this.stop();
        this.config.onExpired();
      }
    }
  }
}
