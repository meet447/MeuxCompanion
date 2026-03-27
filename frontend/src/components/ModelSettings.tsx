import { useState, useEffect, memo } from "react";

interface Props {
  modelId: string;
  onPreviewExpression: (expr: string) => void;
  onClose: () => void;
}

export const ModelSettings = memo(function ModelSettings({
  modelId,
  onPreviewExpression,
  onClose,
}: Props) {
  const [globalExpressions, setGlobalExpressions] = useState<string[]>([]);
  const [modelExpressions, setModelExpressions] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activePreview, setActivePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId) return;

    Promise.all([
      fetch("/api/expressions/global").then((r) => r.json()),
      fetch(`/api/expressions/model/${modelId}`).then((r) => r.json()),
      fetch(`/api/expressions/mapping/${modelId}`).then((r) => r.json()),
    ]).then(([global, model, saved]) => {
      setGlobalExpressions(global);
      setModelExpressions(model);
      setMapping(saved || {});
    });
  }, [modelId]);

  const handlePreview = (expr: string) => {
    setActivePreview(activePreview === expr ? null : expr);
    onPreviewExpression(expr);
  };

  const handleMappingChange = (globalName: string, modelExpr: string) => {
    setMapping((prev) => ({
      ...prev,
      [globalName]: modelExpr,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/expressions/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId, mapping }),
    });
    setSaving(false);
  };

  return (
    <div className="w-[400px] flex flex-col bg-stone-900 border-l border-stone-800/60">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-800/60">
        <h2 className="text-sm font-bold text-stone-200">Expression Mapping</h2>
        <p className="text-xs text-stone-500 mt-0.5">Model: {modelId || "none"}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Model expressions preview */}
        <div>
          <div className="text-xs text-stone-400 mb-2">
            Model Expressions ({modelExpressions.length}) — click to preview
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modelExpressions.map((expr) => (
              <button
                key={expr}
                onClick={() => handlePreview(expr)}
                className={`text-xs px-2.5 py-1.5 rounded-md transition-all ${
                  activePreview === expr
                    ? "bg-amber-700/60 text-amber-100 ring-1 ring-amber-500/50"
                    : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                }`}
              >
                {expr}
              </button>
            ))}
            {modelExpressions.length === 0 && (
              <span className="text-xs text-stone-500">No expressions found</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-stone-800/60" />

        {/* Mapping table */}
        <div>
          <div className="text-xs text-stone-400 mb-2">
            Global → Model Mapping
          </div>
          <div className="space-y-1.5">
            {globalExpressions.map((globalName) => (
              <div
                key={globalName}
                className="flex items-center gap-2 p-2 rounded-lg bg-stone-800/30"
              >
                <span className="text-xs text-stone-300 w-24 shrink-0 capitalize font-medium">
                  {globalName}
                </span>
                <span className="text-stone-600 text-xs">→</span>
                <select
                  value={mapping[globalName] || ""}
                  onChange={(e) => handleMappingChange(globalName, e.target.value)}
                  className="flex-1 bg-stone-800 text-stone-200 text-xs rounded-md px-2 py-1.5 border border-stone-700/50 outline-none focus:border-amber-700/50 cursor-pointer"
                >
                  <option value="">-- none --</option>
                  {modelExpressions.map((expr) => (
                    <option key={expr} value={expr}>
                      {expr}
                    </option>
                  ))}
                </select>
                {/* Preview the mapped expression */}
                {mapping[globalName] && (
                  <button
                    onClick={() => handlePreview(mapping[globalName])}
                    className="text-xs text-stone-500 hover:text-amber-400 transition-colors"
                    title="Preview this expression"
                  >
                    ▶
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-stone-800/60 flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-amber-800/70 hover:bg-amber-700/70 disabled:bg-stone-800 text-amber-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Mapping"}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-sm transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
});
