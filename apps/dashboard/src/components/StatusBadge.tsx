const colors: Record<string, string> = {
  running: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
  created: "bg-yellow-100 text-yellow-800",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = colors[status] ?? "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
}
