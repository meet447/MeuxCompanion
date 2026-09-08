/** True when the UI is running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}
