## 2026-05-01 - Avoid Creating Arrays Inside Loops
**Learning:** Creating arrays from iterables (e.g. `[...map.keys()]` or `Array.from()`) inside a loop incurs significant performance overhead. Measuring this with Node's `perf_hooks` showed around 9-14% performance improvements depending on array size and match positions.
**Action:** Always instantiate arrays from Maps/Sets outside of loops when the underlying collection doesn't change during iteration.

## 2024-05-18 - ChatPanel React List Re-renders
**Learning:** Managing text input state at the top level of a chat panel (`ChatPanel.tsx`) causes O(N) re-renders (where N is the number of messages) on every single keystroke. This causes a significant performance bottleneck, as all historical `MessageBubble` and `ToolCallBubble` components re-render unless explicitly memoized.
**Action:** Always wrap heavy list item components (like message bubbles) in `React.memo` when the parent container handles frequently updating state like text input, to prevent massive unnecessary re-render trees.
