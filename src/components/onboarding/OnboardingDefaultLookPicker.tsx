import { cn } from "../ui/cn";
import { CheckIcon, Surface } from "../ui";
import { CompanionAvatarPreview, type PreviewModel } from "./CompanionAvatarPreview";

export type OnboardingDefaultLookId = "haru" | "utsuwa";

const LOOKS: {
  id: OnboardingDefaultLookId;
  name: string;
  typeLabel: string;
  blurb: string;
}[] = [
  {
    id: "haru",
    name: "Haru",
    typeLabel: "Live2D",
    blurb: "Expressive 2D look - warm and classic.",
  },
  {
    id: "utsuwa",
    name: "Utsuwa",
    typeLabel: "3D VRM",
    blurb: "Soft 3D presence - calm and modern.",
  },
];

export function OnboardingDefaultLookPicker({
  models,
  selectedId,
  onSelect,
}: {
  models: PreviewModel[];
  selectedId: string;
  onSelect: (id: OnboardingDefaultLookId) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {LOOKS.map((look) => {
        const model = models.find((m) => m.id === look.id) ?? null;
        const selected = selectedId === look.id;
        const available = Boolean(model);

        return (
          <button
            key={look.id}
            type="button"
            disabled={!available}
            onClick={() => onSelect(look.id)}
            className={cn(
              "group text-left transition-all duration-150",
              !available && "cursor-not-allowed opacity-50",
            )}
          >
            <Surface
              tone={selected ? "surface" : "well"}
              elevation={selected ? "soft" : "none"}
              className={cn(
                "overflow-hidden p-2.5 ring-2 ring-transparent transition-all duration-150",
                selected
                  ? "bg-accent-100 ring-accent-300/70"
                  : "group-hover:bg-white group-hover:shadow-float",
              )}
            >
              <div className="pointer-events-none overflow-hidden rounded-field">
                <CompanionAvatarPreview model={model} className="h-[200px] rounded-field" />
              </div>
              <div className="mt-3 flex items-start justify-between gap-2 px-1.5 pb-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{look.name}</span>
                    <span className="text-[11px] font-medium text-ink-3">{look.typeLabel}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{look.blurb}</p>
                  {!available && (
                    <p className="mt-1 text-xs text-clay-700">Not available on this device yet.</p>
                  )}
                </div>
                {selected && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                    <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                )}
              </div>
            </Surface>
          </button>
        );
      })}
    </div>
  );
}
