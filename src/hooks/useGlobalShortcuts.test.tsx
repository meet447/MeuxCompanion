import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

const mocks = vi.hoisted(() => ({
  shortcuts: new Map<string, (event: { state: string }) => void>(),
  events: new Map<string, () => void>(),
  register: vi.fn(),
  unregister: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, cb: () => void) => {
    mocks.events.set(name, cb);
    return () => { if (mocks.events.get(name) === cb) mocks.events.delete(name); };
  }),
}));
vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: mocks.register,
  unregister: mocks.unregister,
}));

beforeEach(() => {
  mocks.shortcuts.clear();
  mocks.events.clear();
  vi.clearAllMocks();
  mocks.register.mockImplementation(async (combo, cb) => {
    if (mocks.shortcuts.has(combo)) throw new Error("Already registered");
    mocks.shortcuts.set(combo, cb);
  });
  mocks.unregister.mockImplementation(async (combo) => { mocks.shortcuts.delete(combo); });
});

it("serializes StrictMode registration and uses the latest character and mic callback", async () => {
  const toggleMini = vi.fn();
  const firstMic = vi.fn();
  const nextMic = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ id, mic }) => useGlobalShortcuts({ isMiniMode: false, selectedCharId: id, toggleMini, onMicToggle: mic }),
    { initialProps: { id: "first", mic: firstMic }, wrapper: StrictMode },
  );
  await waitFor(() => expect(mocks.shortcuts.size).toBe(3));
  const registrations = mocks.register.mock.calls.length;
  rerender({ id: "next", mic: nextMic });
  act(() => {
    mocks.shortcuts.get("CommandOrControl+Shift+E")!({ state: "Released" });
    mocks.shortcuts.get("CommandOrControl+Shift+E")!({ state: "Pressed" });
    mocks.events.get("shortcut:mic")!();
  });
  expect(toggleMini).toHaveBeenCalledExactlyOnceWith("next");
  expect(nextMic).toHaveBeenCalledOnce();
  expect(firstMic).not.toHaveBeenCalled();
  expect(mocks.register).toHaveBeenCalledTimes(registrations);
  unmount();
  await waitFor(() => expect(mocks.shortcuts.size).toBe(0));
  expect(mocks.events.size).toBe(0);
});

it("opens the mini composer without registering a second set of shortcuts", () => {
  const { result } = renderHook(() => useGlobalShortcuts({
    isMiniMode: true, selectedCharId: "rika", toggleMini: vi.fn(), onMicToggle: vi.fn(),
  }));
  act(() => mocks.events.get("shortcut:text")!());
  expect(result.current.miniComposerTrigger).toBe(1);
  expect(mocks.register).not.toHaveBeenCalled();
});
