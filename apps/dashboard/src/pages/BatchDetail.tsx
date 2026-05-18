import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchBatchDetail, type BatchDetail, type BatchRun } from "../api";

export function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  useEffect(() => { if (id) fetchBatchDetail(id).then(setBatch).catch(console.error); }, [id]);

  if (!batch) return <div className="p-6 text-gray-400">加载中...</div>;

  const caseIds = [...new Set(batch.runs.map((r) => r.benchmark_case_id))];
  const vsIds = batch.version_set_ids;
  const caseNames = new Map<string, string>();
  const matrix = new Map<string, BatchRun>();
  for (const run of batch.runs) {
    caseNames.set(run.benchmark_case_id, run.case_name);
    matrix.set(`${run.benchmark_case_id}:${run.version_set_id}`, run);
  }

  const avgByVs = vsIds.map((vs) => {
    const scores = caseIds.map((c) => matrix.get(`${c}:${vs}`)?.total_score).filter((s): s is number => s != null);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{batch.suite_name}</h1>
      <p className="text-sm text-gray-500 mb-4">状态: {batch.status} · 进度: {batch.completed_runs + batch.failed_runs}/{batch.total_runs}</p>
      <div className="overflow-x-auto">
        <table className="w-full bg-white rounded shadow text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-3">Benchmark Case</th>
              {vsIds.map((vs) => <th key={vs} className="text-center p-3 min-w-[140px]">{vs.slice(0, 8)}</th>)}
            </tr>
          </thead>
          <tbody>
            {caseIds.map((caseId) => (
              <tr key={caseId} className="border-t">
                <td className="p-3 font-medium">{caseNames.get(caseId)}</td>
                {vsIds.map((vs) => <td key={vs} className="p-3 text-center">{renderCell(matrix.get(`${caseId}:${vs}`))}</td>)}
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 font-semibold bg-gray-50">
              <td className="p-3">均值</td>
              {avgByVs.map((avg, i) => <td key={i} className="p-3 text-center">{avg != null ? avg.toFixed(3) : "—"}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(run?: BatchRun) {
  if (!run) return <span className="text-gray-300">—</span>;
  if (run.workflow_status === "failed" && !run.total_score) return <span className="text-red-500 text-xs">failed</span>;
  if (run.total_score == null) return <span className="text-gray-400 text-xs">{run.workflow_status}</span>;
  const d = run.dimension_scores!;
  return (
    <div>
      <div className="font-semibold">{Number(run.total_score).toFixed(3)}</div>
      <div className="text-xs text-gray-500">S:{d.success.toFixed(1)} E:{d.efficiency.toFixed(2)} C:{d.cost.toFixed(2)}</div>
    </div>
  );
}
