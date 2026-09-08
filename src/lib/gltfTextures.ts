/**
 * Three.js GLTFLoader uses ImageBitmapLoader when createImageBitmap exists and
 * the UA looks like Safari 17+. WebKitGTK (Tauri on Linux) reports that UA, but
 * ImageBitmap uploads come through empty — VRM meshes render white with MToon
 * outline still visible.
 *
 * TextureLoader (HTMLImageElement + img-src blob:) works in that WebView.
 */
export function shouldAvoidImageBitmapLoader(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  if (!userAgent) return false;
  const isWebKit = /AppleWebKit/i.test(userAgent) && !/Chrome|Chromium|Edg\//i.test(userAgent);
  return isWebKit;
}

export async function withHtmlImageTextures<T>(run: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined" || !shouldAvoidImageBitmapLoader()) {
    return run();
  }
  const globalWindow = window as unknown as { createImageBitmap?: Window["createImageBitmap"] };
  const original = globalWindow.createImageBitmap;
  try {
    globalWindow.createImageBitmap = undefined;
    return await run();
  } finally {
    globalWindow.createImageBitmap = original;
  }
}
