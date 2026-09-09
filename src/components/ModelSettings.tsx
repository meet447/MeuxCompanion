import { useState, useEffect, memo } from "react";
import {
  getExpressions,
  listModels,
  getModelExpressions,
  getSupportedExpressions,
  saveExpressions,
} from "../api/tauri";
import {
  Button,
  Hint,
  IconButton,
  InfoIcon,
  Pill,
  PlayIcon,
  SectionTitle,
  Select,
  Notice,
} from "./ui";

import type { AnimationInfo } from "../types";
import { animationLabel, animationMappingValue, DEFAULT_ANIMATION_PREFIX } from "../lib/vrmAnimationOptions";

interface Props {
  modelId: string;
  onPreviewExpression: (expr: string) => void;
  onSaved?: () => void;
}

const FALLBACK_EXPRESSIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "excited",
  "embarrassed",
  "thinking",
  "blush",
  "smirk",
  "scared",
  "disgusted",
];

export const ModelSettings = memo(function ModelSettings({
  modelId,
  onPreviewExpression,
  onSaved,
}: Props) {
  const [globalExpressions, setGlobalExpressions] = useState<string[]>([]);
  const [modelExpressions, setModelExpressions] = useState<string[]>([]);
  const [animations, setAnimations] = useState<AnimationInfo[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setModelExpressions([]);
    setAnimations([]);
    setMapping({});
    setSaveError(null);
    setActivePreview(null);

    listModels().then((models) => {
      if (!cancelled) setAnimations(models.find((model) => model.id === modelId && model.type === "vrm")?.animations ?? []);
    }).catch((err) => {
      if (!cancelled) setSaveError(`Could not load animation choices: ${String(err)}`);
    });

    getSupportedExpressions()
      .then((exprs) => { if (!cancelled) setGlobalExpressions(exprs.length > 0 ? exprs : FALLBACK_EXPRESSIONS); })
      .catch((err) => {
        console.error("Failed to load supported expressions:", err);
        if (!cancelled) setGlobalExpressions(FALLBACK_EXPRESSIONS);
      });

    getModelExpressions(modelId)
      .then((exprs) => {
        if (!cancelled) setModelExpressions(exprs);
      })
      .catch((err) => {
        console.error("Failed to load model expressions:", err);
        if (!cancelled) setModelExpressions([]);
      });

    getExpressions(modelId)
      .then((saved) => {
        if (!cancelled) setMapping(saved || {});
      })
      .catch(() => { if (!cancelled) setMapping({}); });
    return () => { cancelled = true; };
  }, [modelId]);

  const groups = [
    { label: "Model expressions", options: modelExpressions.map((name) => ({ value: name, label: name })) },
    { label: "Model animations", options: animations.filter((animation) => !animation.name.startsWith(DEFAULT_ANIMATION_PREFIX))
      .map((animation) => ({ value: animationMappingValue(animation.name), label: animationLabel(animation.name) })) },
    { label: "Default VRM animations", options: animations.filter((animation) => animation.name.startsWith(DEFAULT_ANIMATION_PREFIX))
      .map((animation) => ({ value: animationMappingValue(animation.name), label: animationLabel(animation.name) })) },
  ].filter((group) => group.options.length > 0);

  const handlePreview = (expr: string) => {
    const next = activePreview === expr ? null : expr;
    setActivePreview(next);
    onPreviewExpression(next ?? "neutral");
  };

  const handleMappingChange = (globalName: string, modelExpr: string) => {
    setMapping((prev) => ({
      ...prev,
      [globalName]: modelExpr,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveExpressions(modelId, mapping);
      onSaved?.();
    } catch (err) {
      console.error("Failed to save expressions:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save expressions. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-3">
        Model: <span className="font-mono text-ink-2">{modelId || "none"}</span>
      </p>

      {groups.map((group) => (
        <div key={group.label}>
          <SectionTitle>{group.label} ({group.options.length})</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePreview(option.value)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                  activePreview === option.value ? "bg-ink text-white shadow-soft" : "bg-well text-ink-2 hover:bg-well-2"
                }`}
              >{option.label}</button>
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && <Pill>No expressions or animations found</Pill>}
      <Hint className="flex items-center gap-1">
        <InfoIcon className="h-3.5 w-3.5" />
        Click a badge to preview it on the model.
        {animations.length > 0 && " Model idle and talking animations take priority; shared defaults fill in when missing."}
      </Hint>

      <div>
        <SectionTitle>Global to model mapping</SectionTitle>
        <div className="space-y-2">
          {globalExpressions.map((globalName) => (
            <div
              key={globalName}
              className="flex items-center gap-3 rounded-card bg-surface-2 p-3 shadow-soft"
            >
              <div className="flex w-24 shrink-0 items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                <span className="text-[13px] font-semibold capitalize text-ink">{globalName}</span>
              </div>
              <span className="text-sm text-ink-4">{"\u2192"}</span>
              <Select
                aria-label={`${globalName} mapping`}
                wrapperClassName="min-w-0 flex-1"
                className="py-2 text-[13px]"
                value={mapping[globalName] || ""}
                onChange={(e) => handleMappingChange(globalName, e.target.value)}
              >
                <option value="">-- select --</option>
                {groups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
                {mapping[globalName] && !groups.some((group) => group.options.some((option) => option.value === mapping[globalName])) && (
                  <option value={mapping[globalName]}>{mapping[globalName]} (saved)</option>
                )}
              </Select>
              {mapping[globalName] && (
                <IconButton
                  label="Preview"
                  size="sm"
                  variant={activePreview === mapping[globalName] ? "soft" : "secondary"}
                  onClick={() => handlePreview(mapping[globalName])}
                >
                  <PlayIcon className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button variant="primary" fullWidth loading={saving} onClick={handleSave}>
        Save mapping
      </Button>
      {saveError && (
        <Notice tone="danger" className="mt-3">{saveError}</Notice>
      )}
    </div>
  );
});
