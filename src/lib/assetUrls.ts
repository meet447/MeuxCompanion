/** Tauri convertFileSrc URLs. Query strings are not part of the file path and 404. */
export function isTauriAssetProtocolUrl(url: string): boolean {
  return (
    url.startsWith("asset:") ||
    url.startsWith("http://asset.localhost") ||
    url.startsWith("https://asset.localhost")
  );
}

/** Vite `tauri dev` / `npm run dev` — same-origin /static/ middleware. */
export function isViteDevHost(
  location: Pick<Location, "hostname" | "port"> | undefined = typeof window === "undefined"
    ? undefined
    : window.location,
): boolean {
  if (!location) return false;
  return location.hostname === "localhost" && location.port === "1420";
}

/** Cache-bust Vite /static/ URLs only. Asset-protocol URLs break with ?t=. */
export function withCacheBust(url: string, now = Date.now()): string {
  if (isTauriAssetProtocolUrl(url)) {
    return url;
  }
  if (!url.includes("/static/")) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}t=${now}`;
}
