import { marked } from "marked";

function stripToolLogs(content: string): string {
  // Remove Kiro CLI tool invocation blocks:
  // "I will run the following command: ... (using tool: ...)"
  // ...output lines...
  // " - Completed in X.Xs" or "Completed in X.Xs"
  const lines = content.split("\n");
  const result: string[] = [];
  let inToolBlock = false;

  for (const line of lines) {
    if (line.match(/^(I will run the following command:|Batch \w+ operation|Reading file:)/)) {
      inToolBlock = true;
      continue;
    }
    if (inToolBlock && line.match(/^\s*-?\s*Completed in \d/)) {
      inToolBlock = false;
      continue;
    }
    if (inToolBlock && line.match(/^\s*(✓|↱|⋮)/)) {
      continue;
    }
    if (!inToolBlock) {
      // Strip leading "> " prefix from AI response lines
      result.push(line.replace(/^>\s?/, ""));
    }
  }
  return result.join("\n").trim();
}

export function MarkdownView({ content }: { content: string }) {
  if (!content) return <p className="text-gray-400 text-sm">无内容</p>;
  const cleaned = stripToolLogs(content);
  const html = marked.parse(cleaned) as string;
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
