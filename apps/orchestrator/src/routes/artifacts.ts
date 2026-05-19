import { Hono } from "hono";
import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { findFiles } from "../helpers.js";

export function createArtifactRoutes() {
  const app = new Hono();

  app.get("/artifacts/:type/:workflowId", async (c) => {
    const type = c.req.param("type");
    const workflowId = c.req.param("workflowId");
    const VALID_TYPE = /^[a-z_]+$/;
    const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    if (!type || !workflowId || !VALID_TYPE.test(type) || !VALID_ID.test(workflowId)) {
      return c.json({ error: "invalid artifact ref" }, 400);
    }
    const basePath = resolve(process.env.ARTIFACT_PATH ?? "./artifacts");
    const targetPath = resolve(join(basePath, type, workflowId));
    if (!targetPath.startsWith(basePath)) return c.json({ error: "access denied" }, 403);
    try {
      if (!existsSync(targetPath)) return c.json({ error: "artifact not found" }, 404);
      const files = await findFiles(targetPath);
      if (files.length === 0) return c.json({ error: "artifact not found" }, 404);
      const content = await readFile(files[0]!, "utf-8");
      const ext = files[0]!.split(".").pop();
      const contentType = ext === "md" ? "text/markdown" : ext === "diff" ? "text/x-diff" : "text/plain";
      return c.text(content, 200, { "Content-Type": contentType });
    } catch {
      return c.json({ error: "artifact not found" }, 404);
    }
  });

  return app;
}
