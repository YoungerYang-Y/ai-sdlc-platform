import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { WorkflowList } from "./pages/WorkflowList";
import { WorkflowDetail } from "./pages/WorkflowDetail";
import { WorkflowCreate } from "./pages/WorkflowCreate";
import { CompareView } from "./pages/CompareView";
import { BatchList } from "./pages/BatchList";
import { BatchDetailPage } from "./pages/BatchDetail";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-bold text-gray-900">AI SDLC Platform</Link>
            <Link to="/experiments" className="text-sm text-gray-600 hover:text-gray-900">实验</Link>
          </div>
          <Link to="/workflows/new" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">新建 Workflow</Link>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<WorkflowList />} />
            <Route path="/workflows/new" element={<WorkflowCreate />} />
            <Route path="/workflows/:id" element={<WorkflowDetail />} />
            <Route path="/compare" element={<CompareView />} />
            <Route path="/experiments" element={<BatchList />} />
            <Route path="/experiments/:id" element={<BatchDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  </React.StrictMode>
);
