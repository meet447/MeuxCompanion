type Live2DMotionEntry = { File?: string };
type Live2DExpressionEntry = { File?: string };
type Live2DFileReferences = {
  Moc?: string;
  Textures?: string[];
  Physics?: string;
  Pose?: string;
  DisplayInfo?: string;
  UserData?: string;
  Expressions?: Live2DExpressionEntry[];
  Motions?: Record<string, Live2DMotionEntry[]>;
};

export type Live2DModelSettings = {
  FileReferences?: Live2DFileReferences;
};

function rewriteRef(rel: string | undefined, toAbsoluteUrl: (relative: string) => string): string | undefined {
  if (!rel) return rel;
  return toAbsoluteUrl(rel);
}

/**
 * convertFileSrc encodes the whole filesystem path as one URL segment, so Live2D
 * relative moc/texture paths resolve to the wrong file. Rewrite them to absolute
 * asset URLs before handing the settings JSON to pixi-live2d-display.
 */
export function rewriteLive2DFileReferences<T extends Live2DModelSettings>(
  settings: T,
  toAbsoluteUrl: (relative: string) => string,
): T {
  const refs = settings.FileReferences;
  if (!refs) return settings;

  const next: Live2DFileReferences = { ...refs };
  next.Moc = rewriteRef(refs.Moc, toAbsoluteUrl);
  if (refs.Textures) {
    next.Textures = refs.Textures.map((texture) => toAbsoluteUrl(texture));
  }
  next.Physics = rewriteRef(refs.Physics, toAbsoluteUrl);
  next.Pose = rewriteRef(refs.Pose, toAbsoluteUrl);
  next.DisplayInfo = rewriteRef(refs.DisplayInfo, toAbsoluteUrl);
  next.UserData = rewriteRef(refs.UserData, toAbsoluteUrl);
  if (refs.Expressions) {
    next.Expressions = refs.Expressions.map((expression) => ({
      ...expression,
      File: rewriteRef(expression.File, toAbsoluteUrl),
    }));
  }
  if (refs.Motions) {
    next.Motions = Object.fromEntries(
      Object.entries(refs.Motions).map(([group, motions]) => [
        group,
        motions.map((motion) => ({
          ...motion,
          File: rewriteRef(motion.File, toAbsoluteUrl),
        })),
      ]),
    );
  }

  return { ...settings, FileReferences: next };
}

export function dirnamePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? normalized : normalized.slice(0, index);
}

export function joinDir(dir: string, relative: string): string {
  const base = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const rel = relative.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${base}/${rel}`;
}
