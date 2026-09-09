# Contributing

Thank you for helping improve Meuxe. This document explains how to get set up and what we look for in contributions.

## Before you start

- **Issues first (for non-trivial work):** open or comment on an [issue](https://github.com/meet447/Meuxe/issues) so maintainers can agree on direction and avoid duplicate effort.
- **Code of conduct:** everyone participating is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Prerequisites:

- **Node.js** 22 recommended (see [`.nvmrc`](.nvmrc))
- **Rust** 1.88.0 with **Cargo** (pinned in [`rust-toolchain.toml`](rust-toolchain.toml); see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for OS-specific packages)
- On **Linux**, install WebKitGTK and related packages (see [`.github/actions/setup-desktop-build/action.yml`](.github/actions/setup-desktop-build/action.yml) for the list used in CI)
- `npm run build` / `npm run tauri dev` fetch Live2D Cubism Core over the network (`scripts/fetch-cubism-core.mjs`); it is not committed

Clone and run in development mode:

```bash
git clone https://github.com/meet447/Meuxe.git
cd Meuxe
npm ci
npm run tauri dev
```

Build a production bundle locally:

```bash
npm run tauri build
```

### Checks before you open a PR

Run these checks locally:

```bash
npm ci
npm run build
npm test

export CC=gcc CXX=g++
gcc_dir=$(dirname "$(gcc -print-file-name=libstdc++.so)")
export RUSTFLAGS="-C link-arg=-L${gcc_dir}"
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

On Linux without a display, `npm run dev` exercises the frontend; full `npm run tauri dev` needs a desktop session.

## Pull requests

- **One logical change per PR** when possible (easier to review and revert).
- **Describe the change** in the PR body: what problem it solves, how you tested it, and any user-visible impact.
- **Match existing style:** formatting, naming, and patterns used in nearby code.
- **Keep commits readable:** clear messages; squash fixup commits before merge if asked.

## Areas of the repo

- `src/` - React (Vite) frontend
- `src-tauri/` - Tauri shell and Rust commands
- `crates/meuxe-core/` - shared Rust logic (persona, memory, sessions, TTS; chat backend is ACP in `src-tauri`)

## Questions

Use [GitHub Discussions](https://github.com/meet447/Meuxe/discussions) or an issue if something in this guide is unclear or outdated.

Character and model IPC response types are generated from Rust into
`src/types/generated/character.ts`. After changing those Rust structs, run
`npm run types:generate`, commit the generated file, and run `npm run build`.
`cargo test -p meuxe-core` rejects stale generated declarations. Keep view-only
fields outside the generated wire types.
