const PREFIX = "meuxe.hint.";

export function hasSeenHint(id: string): boolean {
  try {
    return window.localStorage.getItem(`${PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

export function markHintSeen(id: string): void {
  try {
    window.localStorage.setItem(`${PREFIX}${id}`, "1");
  } catch {
    /* private mode */
  }
}
