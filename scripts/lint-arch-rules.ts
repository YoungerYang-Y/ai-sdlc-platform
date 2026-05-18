/**
 * scripts/lint-arch-rules.ts
 * 双轨演进架构规则自动检测（docs/design-docs/architecture/dual-track-roadmap.md §5）
 *
 * 规则：
 * 1. README.md 中每个 Phase 段落必须同时包含"交付"/"delivery"和"实验"/"experiment"
 * 2. ARCHITECTURE.md "核心对象模型" 章节必须含 workflow_run, task_run, worker_attempt, version_set
 * 3. Phase 描述中禁止纯 bullet 清单（需含"能回答"或"闭环能力"限定词）
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors: string[] = [];

// --- Rule 1: README Phase 段落含双轨关键词 ---
const readme = readFileSync(resolve(root, "README.md"), "utf-8");
const phaseBlocks = readme.split(/(?=^##+ .*Phase|^##+ .*阶段)/im).slice(1);

for (const block of phaseBlocks) {
  const title = block.split("\n")[0]?.trim() ?? "";
  const hasDelivery = /delivery|交付/i.test(block);
  const hasExperiment = /experiment|实验/i.test(block);
  if (!hasDelivery || !hasExperiment) {
    const missing = [];
    if (!hasDelivery) missing.push("delivery/交付");
    if (!hasExperiment) missing.push("experiment/实验");
    errors.push(`README.md [规则1]: "${title}" 缺少关键词: ${missing.join(", ")}`);
  }
}

// --- Rule 2: ARCHITECTURE.md 核心对象模型含四标识符 ---
const arch = readFileSync(resolve(root, "ARCHITECTURE.md"), "utf-8");
const coreModelMatch = arch.match(/##+ 核心对象模型[\s\S]*?(?=\n##[^#]|\n$)/);
if (coreModelMatch) {
  const section = coreModelMatch[0];
  const required = ["workflow_run", "task_run", "worker_attempt", "version_set"];
  const missing = required.filter((id) => !section.includes(id));
  if (missing.length > 0) {
    errors.push(`ARCHITECTURE.md [规则2]: "核心对象模型" 章节缺少标识符: ${missing.join(", ")}`);
  }
} else {
  errors.push(`ARCHITECTURE.md [规则2]: 未找到 "核心对象模型" 章节`);
}

// --- Rule 3: Phase 段落禁止纯 bullet 清单 ---
// 检查 README 中的 Phase 段落，如果只有 bullet 列表而无"能回答"或"闭环能力"则违规
for (const block of phaseBlocks) {
  const title = block.split("\n")[0]?.trim() ?? "";
  const lines = block.split("\n").slice(1).filter((l) => l.trim());
  const hasBullets = lines.some((l) => /^\s*[-*]/.test(l));
  if (!hasBullets) continue; // 无 bullet 不检查
  const hasQualifier = /能回答|闭环能力/i.test(block);
  if (!hasQualifier) {
    errors.push(`README.md [规则3]: "${title}" 为纯 bullet 清单，缺少"能回答"或"闭环能力"限定词`);
  }
}

// --- 输出结果 ---
if (errors.length > 0) {
  console.error(`\n❌ 架构 lint 检查失败 (${errors.length} 项):\n`);
  for (const err of errors) console.error(`  • ${err}`);
  console.error("");
  process.exit(1);
} else {
  console.log("✅ 架构 lint 检查通过");
}
