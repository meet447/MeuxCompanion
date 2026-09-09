export const ANIMATION_MAPPING_PREFIX = "animation:";
export const DEFAULT_ANIMATION_PREFIX = "default:";
export const animationMappingValue = (name: string) => `${ANIMATION_MAPPING_PREFIX}${name}`;
export const animationLabel = (name: string) => name.replace(/^default:/, "").replace(/^VRMA_0?/, "Emote ").replace(/_/g, " ");

export function isIdle(name: string): boolean {
  return /idle|standing|^default$/.test(name.replace(/^default:/, "").toLowerCase());
}
export function isTalking(name: string): boolean {
  return /talk|speaking/.test(name.replace(/^default:/, "").toLowerCase());
}

/** Prefer model clips for each behavior; shared clips remain explicitly selectable. */
export function animationCandidates(names: string[], behavior: "idle" | "talking"): string[] {
  const matching = names.filter(behavior === "idle" ? isIdle : isTalking).sort();
  const own = matching.filter((name) => !name.startsWith(DEFAULT_ANIMATION_PREFIX));
  return own.length ? own : matching;
}

export function findAnimation(names: string[], requested: string): string | undefined {
  const explicit = requested.startsWith(ANIMATION_MAPPING_PREFIX);
  const key = (explicit ? requested.slice(ANIMATION_MAPPING_PREFIX.length) : requested).toLowerCase();
  if (!key) return undefined;
  const exact = names.find((name) => name.toLowerCase() === key);
  if (exact || explicit) return exact;
  // Legacy mappings used bare clip names. Prefer the model over shared defaults.
  const sorted = [...names].sort((a, b) => Number(a.startsWith(DEFAULT_ANIMATION_PREFIX)) - Number(b.startsWith(DEFAULT_ANIMATION_PREFIX)) || a.localeCompare(b));
  return sorted.find((name) => name.replace(/^default:/, "").toLowerCase().includes(key));
}
