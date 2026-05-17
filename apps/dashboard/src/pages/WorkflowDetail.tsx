import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchWorkflow, fetchArtifact, type WorkflowDetail as WFDetail } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { DiffViewer } from "../components/DiffViewer";
import { MarkdownView } from "../components/MarkdownView";

const STEPS = ["code", "verify", "review"];

export function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const [wf, setWf] = useState<WFDetail | null>(null);
  const [patch, setPatch] = useState<string>("");
  const [review, setReview] = useState<string>("");
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const load = async () => {
    if (!id) return;
    try {
      const data = await fetchWorkflow(id);
      setWf(data);
      setError("");

      // Load artifacts if completed
      if (data.status === "completed" || data.status === "failed") {
        // Try loading patch and review (best-effort)
        fetchArtifact(`patch/${id}`).then(setPatch).catch(() => {});
        fetchArtifact(`review_report/${id}`).then(setReview).catch(() => {});
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => {
      if (wf && (wf.status === "completed" || wf.status === "failed")) {
        clearInterval(timerRef.current);
        return;
      }
      load();
    }, 3000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!wf) return <p className="text-gray-400">加载中...</p>;

  const input = wf.input as Record<string, string>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold font-mono">{wf.id.slice(0, 8)}</h1>
        <StatusBadge status={wf.status} />
        <span className="text-gray-400 text-xs">{new Date(wf.created_at).toLocaleString()}</span>
        {wf.finished_at && <span className="text-gray-400 text-xs">→ {new Date(wf.finished_at).toLocaleString()}</span>}
        <Link to={`/workflows/new?from=${wf.id}`} className="ml-auto text-sm text-blue-600 hover:underline">复制新增</Link>
      </div>

      {/* Input */}
      <div className="bg-white border rounded p-4">
        <h2 className="font-medium text-sm text-gray-500 mb-2">需求</h2>
        <p className="text-sm">{input.requirement}</p>
        <div className="mt-2 text-xs text-gray-400 space-x-4">
          {input.repository && <span>仓库: {input.repository}</span>}
          {input.workDir && <span>路径: {input.workDir}</span>}
          {input.verifyCommand && <span>验收: {input.verifyCommand}</span>}
        </div>
      </div>

      {/* Task Timeline */}
      <div className="bg-white border rounded p-4">
        <h2 className="font-medium text-sm text-gray-500 mb-3">执行步骤</h2>
        <div className="flex gap-2">
          {STEPS.map(step => {
            const done = wf.completed_steps.includes(step);
            const current = wf.current_step_id === step && wf.status === "running";
            const cls = done ? "bg-green-100 border-green-300 text-green-800"
              : current ? "bg-blue-100 border-blue-300 text-blue-800 animate-pulse"
              : "bg-gray-100 border-gray-200 text-gray-400";
            return (
              <div key={step} className={`px-4 py-2 border rounded text-sm font-medium ${cls}`}>
                {step}
                {done && " ✓"}
                {current && " ⟳"}
              </div>
            );
          })}
        </div>
      </div>

      {/* Patch */}
      <div className="bg-white border rounded p-4">
        <h2 className="font-medium text-sm text-gray-500 mb-2">代码变更</h2>
        {wf.status === "running" && !patch ? <p className="text-gray-400 text-sm">执行中...</p> : <DiffViewer patch={patch} />}
      </div>

      {/* Review */}
      <div className="bg-white border rounded p-4">
        <h2 className="font-medium text-sm text-gray-500 mb-2">审查报告</h2>
        {wf.status === "running" && !review ? <p className="text-gray-400 text-sm">执行中...</p> : <MarkdownView content={review} />}
      </div>
    </div>
  );
}
