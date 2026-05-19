import type { TaskContext, TaskResult } from "@ai-sdlc/worker-sdk";
import type { FileSystemArtifactStore } from "@ai-sdlc/artifact";

export async function handleMock(ctx: TaskContext, stepId: string, requirement: string, artifactStore: FileSystemArtifactStore, implementation: string): Promise<TaskResult> {
  const { taskRun, evidence } = ctx;
  const output = stepId === "verify"
    ? "All tests passed."
    : `// Generated code for: ${requirement}\nexport function main() { return true; }`;

  const ref = await artifactStore.write({
    content: output,
    metadata: {
      artifactType: stepId === "verify" ? "log" : "patch",
      workflowRunId: taskRun.workflowRunId,
      taskRunId: taskRun.id,
      filename: stepId === "verify" ? "verify.log" : "patch.diff",
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(output),
    },
  });

  evidence.append("tool_called", { toolName: `${implementation}(mock)`, status: "success", durationMs: 100 });
  evidence.append("artifact_written", { ref });
  return { status: "completed", artifactRefs: [ref], finalConclusion: `${stepId} completed (mock)` };
}
