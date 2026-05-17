import { marked } from "marked";

export function MarkdownView({ content }: { content: string }) {
  if (!content) return <p className="text-gray-400 text-sm">无内容</p>;
  const html = marked.parse(content) as string;
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
