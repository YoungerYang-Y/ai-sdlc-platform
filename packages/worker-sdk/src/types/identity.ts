import type { TaskType } from "./execution.js";

export type WorkerRole = "code" | "review";

export type WorkerImplementation = "kiro" | "codex" | "claude-code" | "custom";

export interface WorkerRegistration {
  workerId: string;
  roles: WorkerRole[];
  implementation: WorkerImplementation;
  supportedTaskTypes: TaskType[];
  versionSetId: string;
}
