import { spawn } from "node:child_process";

// --- Interfaces ---

export interface Runtime {
  createSession(config: SessionConfig): Promise<RuntimeSession>;
}

export interface RuntimeSession {
  execute(request: ExecuteRequest): Promise<ExecuteResult>;
  destroy(): Promise<void>;
}

export interface SessionConfig {
  runtimeType: RuntimeType;
  workDir: string;
  timeout: number;
  env?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export type RuntimeType = "cli" | "openhands" | "sandbox";

export interface ExecuteRequest {
  command: string[];
  timeoutMs?: number;
}

export interface ExecuteResult {
  status: "success" | "failed" | "timeout" | "cancelled";
  exitCode?: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

// --- Registry ---

const adapters = new Map<RuntimeType, Runtime>();

export function registerRuntime(type: RuntimeType, runtime: Runtime): void {
  adapters.set(type, runtime);
}

export function getRuntime(type: RuntimeType): Runtime {
  const rt = adapters.get(type);
  if (!rt) throw new Error(`Runtime "${type}" not registered`);
  return rt;
}

// --- CLI Runtime ---

export class CliRuntime implements Runtime {
  async createSession(config: SessionConfig): Promise<RuntimeSession> {
    return new CliSession(config);
  }
}

class CliSession implements RuntimeSession {
  private config: SessionConfig;

  constructor(config: SessionConfig) {
    this.config = config;
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const timeoutMs = request.timeoutMs ?? this.config.timeout;
    const start = Date.now();

    return new Promise<ExecuteResult>((resolve) => {
      const [cmd, ...args] = request.command;
      const proc = spawn(cmd!, args, {
        cwd: this.config.workDir,
        env: { ...process.env, ...this.config.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      proc.stdout.on("data", (d) => { stdout += d; });
      proc.stderr.on("data", (d) => { stderr += d; });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.kill("SIGTERM");
          resolve({ status: "timeout", stdout, stderr, durationMs: Date.now() - start });
        }
      }, timeoutMs);

      const abortHandler = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          proc.kill("SIGTERM");
          resolve({ status: "cancelled", stdout, stderr, durationMs: Date.now() - start });
        }
      };
      this.config.abortSignal?.addEventListener("abort", abortHandler, { once: true });

      proc.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.config.abortSignal?.removeEventListener("abort", abortHandler);
          resolve({
            status: code === 0 ? "success" : "failed",
            exitCode: code ?? undefined,
            stdout,
            stderr,
            durationMs: Date.now() - start,
          });
        }
      });

      proc.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ status: "failed", stderr: err.message, stdout, durationMs: Date.now() - start });
        }
      });
    });
  }

  async destroy(): Promise<void> {
    // CLI session is stateless, nothing to clean up
  }
}

// Auto-register CLI runtime
registerRuntime("cli", new CliRuntime());
