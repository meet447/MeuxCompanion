## 2023-10-27 - Fast Request Bodies
**Learning:** `reqwest`'s multipart `Part::bytes` with `Vec<u8>` or `Cow::Owned(Vec)` triggers deep copies when cloned inside a loop. `reqwest` inherently supports `bytes::Bytes` efficiently, but it requires using `Part::stream` instead.
**Action:** Use `Part::stream(reqwest::Body::from(bytes::Bytes))` for large binary payloads that need to be sent repeatedly, to leverage O(1) atomic reference counting.

## 2024-05-18 - React Timer Update Batching
**Learning:** Sequential calls to `setTimeout` within an iteration loop that dispatch independent React state updaters can result in non-batched N renders (especially when delays interact with JS event loop task queue processing or React 18+ automatic batching boundaries like setTimeout). Additionally, inner asynchronous timer effects (`setTimeout` within `setTimeout`) should always be tracked via refs or cleared appropriately, as un-tracked inner timers continue executing their closures containing outdated state captures or force component updates after unmount.
**Action:** When updating lists of items via intervals/timeouts, collect keys/IDs and perform a single batched timeout state update `setVisible(prev => prev.map(...))` to ensure atomic updates, significantly reducing render counts and memory leaks. Save all timer handles uniformly in refs and clear them on re-render/unmount.

## 2026-05-01 - Avoid Creating Arrays Inside Loops
**Learning:** Creating arrays from iterables (e.g. `[...map.keys()]` or `Array.from()`) inside a loop incurs significant performance overhead. Measuring this with Node's `perf_hooks` showed around 9-14% performance improvements depending on array size and match positions.
**Action:** Always instantiate arrays from Maps/Sets outside of loops when the underlying collection doesn't change during iteration.

## 2024-05-18 - ChatPanel React List Re-renders
**Learning:** Managing text input state at the top level of a chat panel (`ChatPanel.tsx`) causes O(N) re-renders (where N is the number of messages) on every single keystroke. This causes a significant performance bottleneck, as all historical `MessageBubble` and `ToolCallBubble` components re-render unless explicitly memoized.
**Action:** Always wrap heavy list item components (like message bubbles) in `React.memo` when the parent container handles frequently updating state like text input, to prevent massive unnecessary re-render trees.
## 2026-05-09 - Avoid Creating Arrays Inside Loops in React Hooks
**Learning:** Creating arrays from iterables (e.g. `[...map.keys()]` or `Array.from()`) inside frequently called hooks (like `useVRM`) incurs unnecessary O(N) array allocation overhead and memory allocation pressure.
**Action:** Replace `Array.from()` or spread operators with direct `for...of` iterations over Map keys/values to avoid the overhead of intermediate array allocations when searching for a single item.
