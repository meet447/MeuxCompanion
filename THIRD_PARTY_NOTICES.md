# Third-Party Notices

Meuxe bundles or depends on the following third-party software. For a
complete list of transitive dependencies and their licenses, see
`package-lock.json` (npm) and `Cargo.lock` (Rust).

## Live2D Cubism Core

- **License:** Live2D Proprietary Software License (Cubism SDK)
- **Source:** https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js
- **Usage:** Downloaded at build time by `scripts/fetch-cubism-core.mjs` and
  shipped in application binaries. Not committed to git (`public/vendor/` is
  gitignored).

## Haru Live2D Sample Model

- **License:** Live2D Free Material License
- **Source:** Live2D Inc. sample character "Haru"
- **Terms:** https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
- **Location:** `models/live2d/haru/`

## Utsuwa VRM Model

- **License:** MIT
- **Author:** Aikeya
- **Source:** https://github.com/aikeyaorg/aikeya (`static/models/utsuwa.vrm`,
  `static/animations/*.vrma`)
- **Details:** `models/vrm/utsuwa/README.md`

## Fonts

### Figtree

- **License:** SIL Open Font License 1.1
- **Package:** `@fontsource/figtree` (npm)

### JetBrains Mono

- **License:** SIL Open Font License 1.1
- **Package:** `@fontsource/jetbrains-mono` (npm)

## Speech Recognition

### whisper.cpp / whisper-rs

- **License:** MIT
- **Usage:** Local speech-to-text via Rust bindings

### ggml-tiny.bin (OpenAI Whisper)

- **License:** MIT
- **Usage:** Optional local Whisper model weights (user-provided)

## JavaScript / Web Graphics

| Package | License |
|---------|---------|
| pixi-live2d-display | MIT |
| pixi.js | MIT |
| three | MIT |
| @pixiv/three-vrm | MIT |

## Desktop Shell

### Tauri

- **License:** MIT / Apache-2.0
- **Usage:** Cross-platform desktop application framework
