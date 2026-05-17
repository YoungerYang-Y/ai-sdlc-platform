import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

// --- Interfaces ---

export interface ArtifactStore {
  write(params: WriteParams): Promise<string>;
  read(ref: string): Promise<ArtifactContent>;
  list(query: ArtifactQuery): Promise<string[]>;
  delete(ref: string): Promise<void>;
}

export interface WriteParams {
  content: Buffer | string;
  metadata: ArtifactMetadata;
}

export interface ArtifactMetadata {
  artifactType: ArtifactType;
  workflowRunId: string;
  taskRunId?: string;
  attemptId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export type ArtifactType =
  | "patch"
  | "log"
  | "review_report"
  | "reasoning_payload"
  | "evidence_payload";

export interface ArtifactContent {
  data: Buffer;
  metadata: ArtifactMetadata;
}

export interface ArtifactQuery {
  workflowRunId?: string;
  taskRunId?: string;
  attemptId?: string;
  artifactType?: ArtifactType;
}

// --- FileSystem Implementation ---

export interface FileSystemStoreConfig {
  basePath: string;
}

export class FileSystemArtifactStore implements ArtifactStore {
  private basePath: string;
  // TODO: Phase 2 — 元数据持久化到 PostgreSQL artifacts 表，当前进程重启后丢失
  private metadata = new Map<string, ArtifactMetadata>();

  constructor(config: FileSystemStoreConfig) {
    this.basePath = config.basePath;
  }

  async write(params: WriteParams): Promise<string> {
    const { metadata, content } = params;
    const ref = buildRef(metadata);
    const storagePath = join(this.basePath, ref);

    await mkdir(dirname(storagePath), { recursive: true });
    await writeFile(storagePath, content);
    this.metadata.set(ref, metadata);

    return ref;
  }

  async read(ref: string): Promise<ArtifactContent> {
    const storagePath = join(this.basePath, ref);
    const data = await readFile(storagePath);
    const metadata = this.metadata.get(ref);
    if (!metadata) throw new Error(`Metadata not found for ref: ${ref}`);
    return { data, metadata };
  }

  async list(query: ArtifactQuery): Promise<string[]> {
    return [...this.metadata.entries()]
      .filter(([, m]) => {
        if (query.workflowRunId && m.workflowRunId !== query.workflowRunId) return false;
        if (query.taskRunId && m.taskRunId !== query.taskRunId) return false;
        if (query.attemptId && m.attemptId !== query.attemptId) return false;
        if (query.artifactType && m.artifactType !== query.artifactType) return false;
        return true;
      })
      .map(([ref]) => ref);
  }

  async delete(ref: string): Promise<void> {
    const storagePath = join(this.basePath, ref);
    await rm(storagePath, { force: true });
    this.metadata.delete(ref);
  }
}

function buildRef(m: ArtifactMetadata): string {
  const parts = [m.artifactType, m.workflowRunId];
  if (m.taskRunId) parts.push(m.taskRunId);
  parts.push(m.filename);
  return parts.join("/");
}
