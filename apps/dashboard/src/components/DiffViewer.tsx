export function DiffViewer({ patch }: { patch: string }) {
  if (!patch) return <p className="text-gray-400 text-sm">无变更</p>;

  const lines = patch.split("\n");
  return (
    <pre className="text-xs font-mono overflow-x-auto border rounded p-3 bg-gray-900 text-gray-100">
      {lines.map((line, i) => {
        let cls = "";
        if (line.startsWith("+") && !line.startsWith("+++")) cls = "bg-green-900/40 text-green-300";
        else if (line.startsWith("-") && !line.startsWith("---")) cls = "bg-red-900/40 text-red-300";
        else if (line.startsWith("@@")) cls = "text-blue-400";
        else if (line.startsWith("diff ")) cls = "text-yellow-400 font-bold";
        return <div key={i} className={cls}>{line || " "}</div>;
      })}
    </pre>
  );
}
