import type { AttemptEvidenceEvent, EvidenceEventType } from "../types/observability.js";
import type { ObservabilityReporter } from "../types/interfaces.js";

export interface EvidenceCollectorConfig {
  attemptId: string;
  reporter: ObservabilityReporter;
  flushBatchSize: number;
  flushIntervalMs: number;
  maxBufferSize: number;
}

export class EvidenceCollector {
  private sequenceNo = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: EvidenceCollectorConfig;

  /** 暴露给测试用 */
  readonly events: AttemptEvidenceEvent[] = [];

  constructor(config: EvidenceCollectorConfig) {
    this.config = config;
    this.timer = setInterval(() => void this.flush(), config.flushIntervalMs);
  }

  append(eventType: EvidenceEventType, payload: unknown): void {
    if (this.events.length >= this.config.maxBufferSize) return; // 丢弃
    const event: AttemptEvidenceEvent = {
      eventId: `${this.config.attemptId}-${this.sequenceNo}-${eventType}`,
      attemptId: this.config.attemptId,
      sequenceNo: this.sequenceNo++,
      eventType,
      occurredAt: new Date().toISOString(),
      payload,
    };
    this.events.push(event);
    this.config.reporter.appendEvent(event);
    if (this.events.length >= this.config.flushBatchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    await this.config.reporter.flush();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
