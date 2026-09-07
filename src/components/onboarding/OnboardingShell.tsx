import type { ReactNode } from "react";
import { MeuxeMark, Mascot } from "../ui";
import type { MascotMood } from "../ui";
import { cn } from "../ui/cn";

const STEP_LABELS = ["Start", "You", "Look", "Personality", "Voice", "Connect"];

const STEP_HEADINGS = [
  "A companion on your desktop",
  "First, your name",
  "Meet them",
  "Their personality",
  "How they sound",
  "Who answers for them?",
  "See you on the desktop",
];

const STEP_SUBTITLES = [
  "Talk to someone who remembers you. They live on your computer, not in a chat tab.",
  "So they know who they're talking to. Only saved on this device.",
  "Pick a default look. You can explore more models later when you add another companion.",
  "Give them a name and a vibe that fits.",
  "Pick a voice and tap listen.",
  "Meuxe is the face and memory. Choose the assistant on your computer that powers chat.",
  "",
];

const MASCOT_BY_STEP: MascotMood[] = [
  "neutral",
  "happy",
  "surprised",
  "happy",
  "neutral",
  "thinking",
  "happy",
];

export function OnboardingShell({
  step,
  preview,
  children,
}: {
  step: number;
  preview?: ReactNode;
  children: ReactNode;
}) {
  const isDone = step >= 6;
  // Single preview after look is chosen (personality + voice).
  const showPreview = Boolean(preview) && step >= 3 && step <= 4;
  const mascotMood = MASCOT_BY_STEP[Math.min(step, 6)];
  const totalSteps = STEP_LABELS.length;

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-surface scrollbar-thin">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <MeuxeMark className="h-7 w-7" />
          <span className="text-sm font-semibold text-ink">Meuxe</span>
        </div>
        {!isDone && (
          <div
            className="flex items-center gap-1.5"
            aria-label={`Step ${step + 1} of ${totalSteps}`}
          >
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-ink" : "w-1.5",
                  i < step ? "bg-ink-3" : i === step ? "" : "bg-well-2",
                )}
              />
            ))}
          </div>
        )}
      </header>

      <div
        key={step}
        className={cn(
          "mx-auto w-full animate-rise-in px-6 pb-24 pt-10 sm:pt-16",
          step === 2 ? "max-w-[640px]" : "max-w-[560px]",
        )}
      >
        <div className="text-center">
          <Mascot mood={mascotMood} className="mx-auto h-14 w-14" />
          {!isDone && (
            <p className="mt-3 text-[12px] text-ink-3">
              Step {step + 1} of {totalSteps} · {STEP_LABELS[step]}
            </p>
          )}
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">
            {STEP_HEADINGS[Math.min(step, 6)]}
          </h1>
          {STEP_SUBTITLES[step] && (
            <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">
              {STEP_SUBTITLES[step]}
            </p>
          )}
        </div>

        <div className="mt-8">
          {showPreview && <div className="mb-6">{preview}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}
