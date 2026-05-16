import type {
  ClaimRequest,
  ClaimResponse,
  CompleteRequest,
  FailRequest,
  HeartbeatRequest,
  HeartbeatResponse,
} from "../types/execution.js";
import type { Logger } from "../types/interfaces.js";

export interface SchedulerClientConfig {
  baseUrl: string;
  logger: Logger;
}

export class SchedulerClient {
  private baseUrl: string;
  private logger: Logger;

  constructor(config: SchedulerClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.logger = config.logger;
  }

  async claim(req: ClaimRequest): Promise<ClaimResponse | null> {
    const res = await fetch(`${this.baseUrl}/tasks/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`claim failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<ClaimResponse>;
  }

  async heartbeat(req: HeartbeatRequest): Promise<HeartbeatResponse> {
    const res = await fetch(`${this.baseUrl}/attempts/${req.attemptId}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaseToken: req.leaseToken, progress: req.progress }),
    });
    if (res.status === 409) throw new LeaseExpiredError(req.attemptId);
    if (!res.ok) throw new Error(`heartbeat failed: ${res.status}`);
    return res.json() as Promise<HeartbeatResponse>;
  }

  async complete(req: CompleteRequest): Promise<void> {
    const res = await fetch(`${this.baseUrl}/attempts/${req.attemptId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaseToken: req.leaseToken, artifactRefs: req.artifactRefs }),
    });
    if (!res.ok) throw new Error(`complete failed: ${res.status}`);
  }

  async fail(req: FailRequest): Promise<void> {
    const res = await fetch(`${this.baseUrl}/attempts/${req.attemptId}/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaseToken: req.leaseToken,
        failureType: req.failureType,
        failureReason: req.failureReason,
      }),
    });
    if (!res.ok) this.logger.warn("fail request failed", { status: res.status });
  }
}

export class LeaseExpiredError extends Error {
  constructor(attemptId: string) {
    super(`Lease expired for attempt ${attemptId}`);
    this.name = "LeaseExpiredError";
  }
}
