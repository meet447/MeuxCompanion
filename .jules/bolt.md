## 2023-10-27 - Fast Request Bodies
**Learning:** `reqwest`'s multipart `Part::bytes` with `Vec<u8>` or `Cow::Owned(Vec)` triggers deep copies when cloned inside a loop. `reqwest` inherently supports `bytes::Bytes` efficiently, but it requires using `Part::stream` instead.
**Action:** Use `Part::stream(reqwest::Body::from(bytes::Bytes))` for large binary payloads that need to be sent repeatedly, to leverage O(1) atomic reference counting.
