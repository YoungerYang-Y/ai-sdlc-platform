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
  const ts = () => new Date().toISOString();
  return {
    debug: (msg, meta) => console.debug(ts(), prefix, msg, meta ?? ""),
    info: (msg, meta) => console.info(ts(), prefix, msg, meta ?? ""),
    warn: (msg, meta) => console.warn(ts(), prefix, msg, meta ?? ""),
    error: (msg, meta) => console.error(ts(), prefix, msg, meta ?? ""),
  };
}

/** Phase 1 no-op telemetry */
export function createNoopTelemetry(): TelemetryProvider {
  return {
    startSpan: () => ({ end: () => {}, setAttribute: () => {} }),
  };
}
