import type { AttemptEvidenceEvent, AttemptSummaryReport } from "./observability.js";

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface ObservabilityReporter {
  appendEvent(event: AttemptEvidenceEvent): void;
  sendSummary(report: AttemptSummaryReport): Promise<void>;
  flush(): Promise<void>;
}

export interface TelemetryProvider {
  startSpan(name: string): Span;
}

export interface Span {
  end(): void;
  setAttribute(key: string, value: string | number): void;
}

/** 默认 console logger */
export function createConsoleLogger(workerId: string): Logger {
  const prefix = `[${workerId}]`;
  return {
    debug: (msg, meta) => console.debug(prefix, msg, meta ?? ""),
    info: (msg, meta) => console.info(prefix, msg, meta ?? ""),
    warn: (msg, meta) => console.warn(prefix, msg, meta ?? ""),
    error: (msg, meta) => console.error(prefix, msg, meta ?? ""),
  };
}

/** Phase 1 no-op telemetry */
export function createNoopTelemetry(): TelemetryProvider {
  return {
    startSpan: () => ({ end: () => {}, setAttribute: () => {} }),
  };
}
