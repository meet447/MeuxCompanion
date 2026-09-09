import { useEffect, useId, useState } from "react";
import { getAgentModels, type AgentModelsResponse } from "../../api/tauri";
import { Button, Field, Select } from "../ui";

// Share in-flight probes across remounts without caching an account's model list.
const pending = new Map<string, Promise<AgentModelsResponse>>();

interface Props {
  preset: string;
  program: string;
  args: string;
  model: string;
  onChange: (model: string) => void;
}

export function AgentModelPicker({ preset, program, args, model, onChange }: Props) {
  const controlId = useId();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: AgentModelsResponse;
    error?: string;
  } | null>(null);
  const key = JSON.stringify([preset, program, args, revision]);
  const ready = preset !== "custom" || program.trim().length > 0;
  const current = state?.key === key ? state : null;
  const data = current?.data;
  const loading = ready && !current;
  const unavailable = !!model && !!data && !data.models.some((entry) => entry.id === model);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Custom commands are editable; avoid launching a process on every keystroke.
    const timer = window.setTimeout(() => {
      const probeKey = JSON.stringify([preset, program, args]);
      let request = pending.get(probeKey);
      if (!request) {
        request = getAgentModels({
          preset,
          program,
          args: args.trim() ? args.trim().split(/\s+/) : [],
          auto_approve_tools: false,
        });
        pending.set(probeKey, request);
        const remove = () => { if (pending.get(probeKey) === request) pending.delete(probeKey); };
        void request.then(remove, remove);
      }
      void request.then(
        (data) => { if (!cancelled) setState({ key, data }); },
        (error: unknown) => {
          if (!cancelled) setState({ key, error: error instanceof Error ? error.message : String(error) });
        },
      );
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [key, preset, program, args, ready]);

  const hint = !ready
    ? "Enter the agent command to load its models."
    : loading
      ? "Loading models from your agent…"
      : data && (!data.supported || data.models.length === 0)
        ? "This agent did not report selectable models. Its default model will be used."
        : "Models available to your signed-in agent. Save agent to use your choice for the next conversation turn.";

  return (
    <Field label="Model" htmlFor={controlId} hint={hint} error={current?.error || (unavailable ? "This saved model is no longer listed. Choose another model or the agent default." : undefined)}>
      <div className="flex items-start gap-2">
        <Select
          id={controlId}
          aria-label="Agent model"
          wrapperClassName="min-w-0 flex-1"
          value={model}
          onChange={(event) => onChange(event.target.value)}
          disabled={loading || !ready}
        >
          <option value="">Agent default{data?.current_model ? ` (${data.models.find((entry) => entry.id === data.current_model)?.name ?? data.current_model})` : ""}</option>
          {model && !data?.models.some((entry) => entry.id === model) && (
            <option value={model}>{model}{unavailable ? " (unavailable)" : " (saved)"}</option>
          )}
          {data?.models.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.group ? `${entry.group} · ` : ""}{entry.name}
            </option>
          ))}
        </Select>
        <Button variant="ghost" disabled={!ready || loading} onClick={() => setRevision((value) => value + 1)}>
          Refresh
        </Button>
      </div>
      {data?.models.find((entry) => entry.id === model)?.description && (
        <p className="mt-2 text-xs text-ink-3">{data.models.find((entry) => entry.id === model)?.description}</p>
      )}
    </Field>
  );
}
