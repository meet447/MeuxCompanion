## 2026-05-01 - Avoid Creating Arrays Inside Loops
**Learning:** Creating arrays from iterables (e.g. `[...map.keys()]` or `Array.from()`) inside a loop incurs significant performance overhead. Measuring this with Node's `perf_hooks` showed around 9-14% performance improvements depending on array size and match positions.
**Action:** Always instantiate arrays from Maps/Sets outside of loops when the underlying collection doesn't change during iteration.
