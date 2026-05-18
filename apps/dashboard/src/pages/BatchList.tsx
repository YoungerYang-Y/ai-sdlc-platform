import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBatches, type BatchSummary } from "../api";

export function BatchList() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  useEffect(() => { fetchBatches().then(setBatches); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">实验批次</h1>
      <table className="w-full bg-white rounded shadow text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left p-3">Suite</th>
            <th className="text-left p-3">状态</th>
            <th className="text-left p-3">进度</th>
            <th className="text-left p-3">配置数</th>
            <th className="text-left p-3">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t hover:bg-gray-50">
              <td className="p-3"><Link to={`/experiments/${b.id}`} className="text-blue-600 hover:underline">{b.suite_name}</Link></td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${b.status === "completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{b.status}</span></td>
              <td className="p-3">{b.completed_runs + b.failed_runs}/{b.total_runs}</td>
              <td className="p-3">{b.version_set_ids.length}</td>
              <td className="p-3 text-gray-500">{new Date(b.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {batches.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-400">暂无实验批次</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
