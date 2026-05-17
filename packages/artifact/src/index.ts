import { mkdir, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

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
  private metadata = new Map<string, ArtifactMetadata>();

  constructor(config: FileSystemStoreConfig) {
    this.basePath = config.basePath;
    // 启动时异步重建索引
    void this.rebuildIndex().catch((err) => console.warn("artifact index rebuild failed", err));
  }

  /** 扫描文件系统重建内存索引，使进程重启后 list()/read() 不丢失 */
  async rebuildIndex(): Promise<void> {
    const ARTIFACT_TYPES: ArtifactType[] = ["patch", "log", "review_report", "reasoning_payload", "evidence_payload"];
    for (const type of ARTIFACT_TYPES) {
      const typeDir = join(this.basePath, type);
      const typeStat = await stat(typeDir).catch(() => null);
      if (!typeStat?.isDirectory()) continue;
      const workflows = await readdir(typeDir);
      for (const wfId of workflows) {
        const wfDir = join(typeDir, wfId);
        const wfStat = await stat(wfDir).catch(() => null);
        if (!wfStat?.isDirectory()) continue;
        await this.scanDir(wfDir, type, wfId);
      }
    }
  }

  private async scanDir(dir: string, artifactType: ArtifactType, workflowRunId: string): Promise<void> {
    const entries = await readdir(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const s = await stat(full);
      if (s.isDirectory()) {
        await this.scanDir(full, artifactType, workflowRunId);
      } else if (s.isFile()) {
        const ref = relative(this.basePath, full);
        if (!this.metadata.has(ref)) {
          this.metadata.set(ref, {
            artifactType,
            workflowRunId,
            filename: entry,
            mimeType: inferMimeType(entry),
            sizeBytes: s.size,
          });
        }
      }
    }
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

function inferMimeType(filename: string): string {
  const ext = filename.split(".").pop();
  if (ext === "md") return "text/markdown";
  if (ext === "diff") return "text/x-diff";
  return "text/plain";
}
