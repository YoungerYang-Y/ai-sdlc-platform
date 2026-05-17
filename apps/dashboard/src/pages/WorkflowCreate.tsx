import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createWorkflow, fetchWorkflow } from "../api";

export function WorkflowCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ requirement: "", repository: "", workDir: "", branch: "", verifyCommand: "", triggerType: "manual", implementation: "kiro" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill from existing workflow
  useEffect(() => {
    const fromId = searchParams.get("from");
    if (fromId) {
      fetchWorkflow(fromId).then(wf => {
        const input = wf.input as Record<string, string>;
        setForm({
          requirement: input.requirement ?? "",
          repository: input.repository ?? "",
          workDir: input.workDir ?? "",
          branch: input.branch ?? "",
          verifyCommand: input.verifyCommand ?? "",
          triggerType: wf.trigger_type ?? "manual",
          implementation: input.implementation ?? "kiro",
        });
      }).catch(() => {});
    }
  }, [searchParams]);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requirement.trim()) { setError("需求描述不能为空"); return; }
    if (!form.repository && !form.workDir) { setError("仓库 URL 或本地路径至少填一个"); return; }

    setLoading(true);
    setError("");
    try {
      const wf = await createWorkflow(form);
      navigate(`/workflows/${wf.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-4">新建 Workflow</h1>
      <form onSubmit={submit} className="space-y-4">
        <Field label="需求描述 *" value={form.requirement} onChange={v => set("requirement", v)} textarea />
        <Field label="仓库 URL（远程 clone）" value={form.repository} onChange={v => set("repository", v)} placeholder="git@github.com:org/repo.git" />
        <Field label="本地路径（本地模式）" value={form.workDir} onChange={v => set("workDir", v)} placeholder="/path/to/repo" />
        <Field label="分支" value={form.branch} onChange={v => set("branch", v)} placeholder="main" />
        <Field label="验收命令" value={form.verifyCommand} onChange={v => set("verifyCommand", v)} placeholder="pnpm test && pnpm typecheck" />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">触发类型</label>
          <select value={form.triggerType} onChange={e => set("triggerType", e.target.value)}
            className="border rounded px-3 py-2 w-full text-sm">
            <option value="manual">manual（交付模式）</option>
            <option value="experiment">experiment（实验模式）</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Implementation</label>
          <select value={form.implementation} onChange={e => set("implementation", e.target.value)}
            className="border rounded px-3 py-2 w-full text-sm">
            <option value="kiro">kiro（Kiro CLI）</option>
            <option value="codex">codex（Codex CLI）</option>
          </select>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {loading ? "提交中..." : "提交"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean;
}) {
  const cls = "border rounded px-3 py-2 w-full text-sm";
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${cls} h-24`} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      }
    </div>
  );
}
