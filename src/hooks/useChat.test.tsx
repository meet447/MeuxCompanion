import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "./useChat";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  listen: vi.fn(), send: vi.fn(), cancel: vi.fn(), confirm: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("../api/tauri", () => ({ sendChat: mocks.send, cancelChat: mocks.cancel, confirmToolCall: mocks.confirm }));

function subscribe(name: string, handler: (event: { payload: unknown }) => void) {
  const handlers = mocks.handlers.get(name) ?? new Set();
  mocks.handlers.set(name, handlers);
  handlers.add(handler);
  return vi.fn(() => handlers.delete(handler));
}
function emit(name: string, payload: Record<string, unknown> = {}, requestId = "request-1") {
  act(() => {
    for (const handler of [...(mocks.handlers.get(name) ?? [])]) {
      handler({ payload: { request_id: requestId, ...payload } });
    }
  });
}
function listenerCount() {
  return [...mocks.handlers.values()].reduce((sum, handlers) => sum + handlers.size, 0);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
async function start() {
  const hook = renderHook(() => useChat());
  await act(async () => { await hook.result.current.send("rika", "Hello", "request-1"); });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.handlers.clear();
  mocks.listen.mockImplementation(async (name, handler) => subscribe(name, handler));
  mocks.send.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.confirm.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("useChat", () => {
  it("registers before sending, filters requests and commits cleaned streaming text", async () => {
    mocks.send.mockImplementation(async () => { expect(listenerCount()).toBe(10); });
    const { result } = await start();
    expect(result.current.isStreaming).toBe(true);
    emit("chat:text-chunk", { text: "wrong turn" }, "other");
    emit("chat:sentence", { index: 0, text: "Hello", expression: "happy" });
    emit("chat:text-chunk", { text: "[expression:happy] Hello!<<<meuxe{}>>>" });
    act(() => vi.advanceTimersByTime(20));
    expect(result.current.streamingText).toBe("Hello!");
    emit("chat:done", { state_update: null });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingText).toBe("");
    expect(result.current.timeline).toEqual([
      expect.objectContaining({ kind: "user", text: "Hello" }),
      expect.objectContaining({ kind: "assistant", text: "Hello!", expression: "happy" }),
    ]);
    expect(listenerCount()).toBe(2); // Late audio remains subscribed.
  });

  it("preserves text/tool/text ordering and completes a tool in place", async () => {
    const { result } = await start();
    emit("chat:text-chunk", { text: "Checking. " });
    emit("chat:tool-call-start", { tool_call_id: "tool-1", tool_name: "read", arguments: {} });
    emit("chat:tool-call-result", { tool_call_id: "tool-1", result: "Found it", success: true });
    emit("chat:text-chunk", { text: "Here it is." });
    emit("chat:done");
    expect(result.current.timeline.map((item) => item.kind)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(result.current.toolCalls[0]).toMatchObject({ status: "completed", result: "Found it" });
  });

  it.each([true, false])("routes permission decisions by permission ID: %s", async (approved) => {
    const { result } = await start();
    emit("chat:tool-confirm", { tool_call_id: "tool-1", permission_id: "permission-1", tool_name: "shell", arguments: {}, description: "Run command", options: [] });
    expect(result.current.toolCalls[0].status).toBe("awaiting_confirmation");
    await act(async () => result.current.handleConfirm("permission-1", approved));
    expect(mocks.confirm).toHaveBeenCalledWith("permission-1", approved);
    expect(result.current.toolCalls[0].status).toBe(approved ? "running" : "failed");
  });

  it("reports confirmation delivery failure", async () => {
    const { result } = await start();
    emit("chat:tool-confirm", { tool_call_id: "tool-1", permission_id: "permission-1", tool_name: "shell", arguments: {} });
    mocks.confirm.mockRejectedValueOnce(new Error("closed"));
    await act(async () => result.current.handleConfirm("permission-1", true));
    expect(result.current.toolCalls[0]).toMatchObject({ status: "failed", result: "Failed to send confirmation" });
  });

  it("delivers late audio and audio timeouts, then replaces listeners for the next turn", async () => {
    const { result, unmount } = await start();
    const audio = vi.fn(); const failed = vi.fn(); const done = vi.fn();
    act(() => { result.current.setOnAudio(audio); result.current.setOnAudioFailed(failed); result.current.setOnDone(done); });
    emit("chat:done", { state_update: null });
    emit("chat:audio", { index: 0, data: "audio" });
    emit("chat:audio-failed", { index: 1, reason: "timeout", message: "TTS timed out" });
    expect(audio).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
    await act(async () => result.current.send("rika", "Again", "request-2"));
    emit("chat:audio", { index: 2, data: "old" });
    expect(audio).toHaveBeenCalledOnce();
    unmount();
    expect(listenerCount()).toBe(0);
  });

  it("keeps partial text and unwinds a backend error", async () => {
    const { result } = await start();
    const failed = vi.fn();
    act(() => result.current.setOnError(failed));
    emit("chat:text-chunk", { text: "Partial reply" });
    emit("chat:error", { message: "Agent timed out" });
    expect(result.current.error).toBe("Agent timed out");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.timeline[result.current.timeline.length - 1]).toMatchObject({ text: "Partial reply" });
    expect(failed).toHaveBeenCalledWith("request-1");
    expect(listenerCount()).toBe(0);
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("unwinds an IPC failure without waiting for a backend event", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Connection lost"));
    const { result } = await start();
    expect(result.current.error).toBe("Connection lost");
    expect(result.current.isStreaming).toBe(false);
    expect(listenerCount()).toBe(0);
  });

  it("cancels the backend, keeps partial text and stops the speech request", async () => {
    const { result } = await start();
    const stopSpeech = vi.fn();
    act(() => result.current.setOnError(stopSpeech));
    emit("chat:text-chunk", { text: "Partial" });
    await act(async () => result.current.cancel());
    expect(mocks.cancel).toHaveBeenCalledOnce();
    emit("chat:cancelled");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.timeline[result.current.timeline.length - 1]).toMatchObject({ text: "Partial" });
    expect(stopSpeech).toHaveBeenCalledWith("request-1");
    expect(listenerCount()).toBe(0);
  });

  it("rejects duplicate sends in the same render", async () => {
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await Promise.all([result.current.send("rika", "One", "1"), result.current.send("rika", "Two", "2")]);
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("cleans up registrations that finish after unmount and never sends", async () => {
    const ready = deferred<void>();
    mocks.listen.mockImplementation(async (name, handler) => {
      if (name !== "chat:text-chunk") await ready.promise;
      return subscribe(name, handler);
    });
    const { result, unmount } = renderHook(() => useChat());
    let sending!: Promise<void>;
    act(() => { sending = result.current.send("rika", "Hello", "request-1"); });
    await act(async () => {});
    expect(listenerCount()).toBe(1);
    unmount();
    expect(listenerCount()).toBe(0);
    await act(async () => { ready.resolve(); await sending; });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(listenerCount()).toBe(0);
  });

  it("recovers from partial listener setup failure, including late registrations", async () => {
    const ready = deferred<void>();
    mocks.listen.mockImplementation(async (name, handler) => {
      if (name === "chat:error") throw new Error("Cannot listen");
      await ready.promise;
      return subscribe(name, handler);
    });
    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.send("rika", "Hello", "request-1").catch(() => {}); });
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(result.current.error).toBe("Cannot listen");
    expect(result.current.isStreaming).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(listenerCount()).toBe(0);
  });
});
