import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { fetchWorkflows, type WorkflowSummary } from "../api";
import { StatusBadge } from "../components/StatusBadge";

const TABS = ["all", "running", "completed", "failed"] as const;

export function WorkflowList() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [tab, setTab] = useState<string>("all");
  const [error, setError] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const load = async () => {
    try {
      const data = await fetchWorkflows(tab === "all" ? undefined : tab);
      setWorkflows(data);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
    const hasRunning = workflows.some(w => w.status === "running");
    if (hasRunning || tab === "running") {
      timerRef.current = setInterval(load, 5000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tab]);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded text-sm ${tab === t ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
            {t === "all" ? "全部" : t}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {workflows.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p>暂无数据</p>
          <Link to="/workflows/new" className="text-blue-600 underline text-sm mt-2 inline-block">创建第一个 Workflow</Link>
        </div>
      ) : (
        <table className="w-full text-sm border rounded overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">状态</th>
              <th className="text-left px-3 py-2">需求</th>
              <th className="text-left px-3 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map(w => (
              <tr key={w.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2"><Link to={`/workflows/${w.id}`} className="text-blue-600 font-mono text-xs">{w.id.slice(0, 8)}</Link></td>
                <td className="px-3 py-2"><StatusBadge status={w.status} /></td>
                <td className="px-3 py-2 truncate max-w-xs">{w.requirement ?? "-"}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{new Date(w.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
