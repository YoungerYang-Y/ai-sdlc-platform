import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchCompare, type ScorecardData } from "../api";
import { StatusBadge } from "../components/StatusBadge";

const DIMENSIONS = ["success", "efficiency", "cost"] as const;

export function CompareView() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<{ a: ScorecardData; b: ScorecardData } | null>(null);
  const [error, setError] = useState("");
  const [idA, setIdA] = useState(searchParams.get("a") ?? "");
  const [idB, setIdB] = useState(searchParams.get("b") ?? "");

  const load = async () => {
    if (!idA || !idB) return;
    try {
      const result = await fetchCompare(idA, idB);
      setData(result);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (idA && idB) load();
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Scorecard 对比</h1>

      {/* Selector */}
      <div className="flex gap-4 mb-6 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Workflow A</label>
          <input value={idA} onChange={e => setIdA(e.target.value)} placeholder="workflow ID"
            className="border rounded px-3 py-1.5 text-sm w-72 font-mono" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Workflow B</label>
          <input value={idB} onChange={e => setIdB(e.target.value)} placeholder="workflow ID"
            className="border rounded px-3 py-1.5 text-sm w-72 font-mono" />
        </div>
        <button onClick={load} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">对比</button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-6">
          <ScoreCard label="A" data={data.a} winner={getWinner(data)} />
          <ScoreCard label="B" data={data.b} winner={getWinner(data)} />
        </div>
      )}
    </div>
  );
}

function getWinner(data: { a: ScorecardData; b: ScorecardData }): "a" | "b" | "tie" {
  const ta = data.a.scorecard?.total ?? 0;
  const tb = data.b.scorecard?.total ?? 0;
  if (ta > tb) return "a";
  if (tb > ta) return "b";
  return "tie";
}

function ScoreCard({ label, data, winner }: { label: "A" | "B"; data: ScorecardData; winner: "a" | "b" | "tie" }) {
  const isWinner = winner === label.toLowerCase();
  return (
    <div className={`border rounded p-4 ${isWinner ? "border-green-400 bg-green-50" : "bg-white"}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="font-bold text-lg">{label}</span>
        {data.status && <StatusBadge status={data.status} />}
        {isWinner && <span className="text-green-600 text-xs font-medium">🏆 胜出</span>}
      </div>

      <div className="text-xs text-gray-500 mb-3 space-y-1">
        <p>ID: <span className="font-mono">{data.workflowId.slice(0, 8)}</span></p>
        {data.implementation && <p>Implementation: {data.implementation}</p>}
        {data.durationMs != null && <p>耗时: {(data.durationMs / 1000).toFixed(1)}s</p>}
      </div>

      {data.scorecard ? (
        <div className="space-y-2">
          {DIMENSIONS.map(dim => (
            <div key={dim} className="flex items-center gap-2">
              <span className="text-xs w-20 text-gray-600">{dim}</span>
              <div className="flex-1 h-4 bg-gray-200 rounded overflow-hidden">
                <div className="h-full bg-blue-500 rounded" style={{ width: `${data.scorecard![dim] * 100}%` }} />
              </div>
              <span className="text-xs w-10 text-right font-mono">{data.scorecard![dim].toFixed(2)}</span>
            </div>
          ))}
          <div className="pt-2 border-t mt-2 flex justify-between">
            <span className="text-sm font-medium">总分</span>
            <span className="text-sm font-bold">{data.scorecard.total.toFixed(3)}</span>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">暂无评分数据</p>
      )}
    </div>
  );
}
