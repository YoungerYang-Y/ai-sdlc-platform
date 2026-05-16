import type { AttemptEvidenceEvent, AttemptSummaryReport } from "../types/observability.js";
import type { Logger, ObservabilityReporter } from "../types/interfaces.js";

export interface ObservabilityClientConfig {
  baseUrl: string;
  logger: Logger;
}

export class ObservabilityClient implements ObservabilityReporter {
  private baseUrl: string;
  private logger: Logger;
  private buffer: AttemptEvidenceEvent[] = [];

  constructor(config: ObservabilityClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.logger = config.logger;
  }

  appendEvent(event: AttemptEvidenceEvent): void {
    this.buffer.push(event);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0);
    const attemptId = events[0]!.attemptId;
    try {
      const res = await fetch(`${this.baseUrl}/attempts/${attemptId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) {
        this.logger.warn("evidence flush failed", { status: res.status });
        this.buffer.unshift(...events); // 放回缓冲区
      }
    } catch (err) {
      this.logger.warn("evidence flush error", { error: String(err) });
      this.buffer.unshift(...events);
    }
  }

  async sendSummary(report: AttemptSummaryReport): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/attempts/${report.attemptId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!res.ok) this.logger.warn("summary send failed", { status: res.status });
    } catch (err) {
      this.logger.warn("summary send error", { error: String(err) });
    }
  }
}
