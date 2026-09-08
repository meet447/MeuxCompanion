# App updates (GitHub Releases)

Meuxe uses [Tauri's built-in updater](https://v2.tauri.app/plugin/updater/) with releases published to GitHub. Installed apps check for updates on launch and from **Settings → Privacy & data → App updates**.

## How it works

1. Push a `v*` tag (for example `v0.2.0`) to trigger `.github/workflows/release.yml`.
2. CI builds macOS and Linux bundles, signs updater artifacts, and uploads them to a draft GitHub Release.
3. `tauri-action` publishes `latest.json` plus signed update bundles (`.tar.gz` on macOS, `.AppImage` on Linux).
4. Running apps fetch `https://github.com/meet447/Meuxe/releases/latest/download/latest.json`, verify the signature with the embedded public key, download the bundle, install, and restart.

## One-time signing setup

Updater packages must be signed. Generate a keypair once and store the private key in GitHub Actions secrets.

```bash
npx tauri signer generate -w ~/.tauri/meuxe-updater.key -p "" --ci
```

1. Copy the **public** key (single line) into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
2. Add GitHub repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of the private key file (or the file path on the runner; we use contents in CI).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — leave empty if the key has no password.

**Important:** If you lose the private key, you cannot ship updates to users on the old public key. Back up `~/.tauri/meuxe-updater.key` securely.

The public key committed in this repo matches a keypair generated during the auto-update rollout. Before the first signed release, add the matching private key to repository secrets (or regenerate keys and update `pubkey`).

## Publishing a release

Release title, tag, and notes come from the app version and `CHANGELOG.md`. Do not edit them in the workflow file.

```bash
# 1. Bump version in package.json, src-tauri/tauri.conf.json,
#    src-tauri/Cargo.toml, and crates/meuxe-core/Cargo.toml (keep them identical).
# 2. Add a "## [x.y.z] - YYYY-MM-DD" section in CHANGELOG.md. That section is
#    copied onto the GitHub Release.
npm run check:release-notes
git tag v0.2.0
git push origin v0.2.0
```

The Tauri CLI will not build if the Rust `tauri` crate and npm `@tauri-apps/api` differ on major.minor (for example 2.10 vs 2.11). After changing Tauri plugins, run `npm run check:tauri-versions` and keep `Cargo.lock` / `package-lock.json` on the same 2.x minor.

When CI finishes, review the draft release on GitHub and publish. Users on an older signed build will see the update in-app after the release is public.

## Platforms

| Platform | Update bundle | Notes |
|----------|---------------|-------|
| macOS (Apple Silicon) | `.app.tar.gz` | Not signed or notarized. First install: `xattr -cr /Applications/Meuxe.app`. Code signing + notarization improves first-run and update UX. |
| Linux | `.AppImage` | `.deb` is built for manual install; the updater uses AppImage. |
| Windows | Not in CI yet | Add a Windows matrix job and NSIS/MSI targets when needed. |

## Local testing

Updater checks are disabled in the Vite browser dev server (`npm run dev`). To test end-to-end:

1. Build and install a release locally with the same signing key as CI.
2. Publish a newer version to GitHub Releases (or point `plugins.updater.endpoints` at a test `latest.json`).
3. Launch the older build and use **Check for updates** in Settings.

## Troubleshooting

- **"Could not check for updates"** — confirm CSP allows GitHub (`connect-src` in `tauri.conf.json`) and the release is published (not draft).
- **Signature verification failed** — `TAURI_SIGNING_PRIVATE_KEY` in CI does not match `plugins.updater.pubkey`.
- **No update offered** — `latest.json` version must be greater than the installed app version (semver).
- **`Found version mismatched Tauri packages`** — `@tauri-apps/api` and the Rust `tauri` crate are on different major.minor versions. Align them (see above) and re-run the release.
- **Release created for the wrong tag** — the git tag must match `version` in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `crates/meuxe-core/Cargo.toml`. The workflow names the GitHub Release from that version.
- **`CHANGELOG.md has no "## [x.y.z]" section`** — add notes for the current app version before tagging. The Release workflow copies that section as the GitHub Release body.
