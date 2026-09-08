import { ImageBitmapLoader } from "three";

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

let imageBitmapPatched = false;

/** Route GLTF image loads through HTMLImageElement in WebKitGTK / WKWebView. */
export function patchGltfImageBitmapLoader(): void {
  if (imageBitmapPatched || typeof window === "undefined") return;
  if (!shouldAvoidImageBitmapLoader()) return;
  imageBitmapPatched = true;

  ImageBitmapLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
    const image = document.createElement("img");
    // crossOrigin on blob: URLs fails in WebKit; embedded GLB textures are blobs.
    if (this.crossOrigin && !url.startsWith("blob:")) {
      image.crossOrigin = this.crossOrigin;
    }
    const fullUrl = this.path ? `${this.path}${url}` : url;
    image.onload = () => {
      image.onload = null;
      onLoad?.(image as unknown as ImageBitmap);
    };
    image.onerror = (event) => {
      onError?.(event as unknown as ErrorEvent);
    };
    image.src = fullUrl;
    return image as unknown as ImageBitmap;
  };
}

export async function withHtmlImageTextures<T>(run: () => Promise<T>): Promise<T> {
  patchGltfImageBitmapLoader();
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
