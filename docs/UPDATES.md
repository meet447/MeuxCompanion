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

```bash
# Bump version in package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml
git tag v0.2.0
git push origin v0.2.0
```

When CI finishes, review the draft release on GitHub, edit release notes if needed, and publish. Users on an older signed build will see the update in-app after the release is public.

## Platforms

| Platform | Update bundle | Notes |
|----------|---------------|-------|
| macOS (arm64, x64) | `.app.tar.gz` | Unsigned app bundles still install; Gatekeeper may require manual approval. Code signing + notarization improves first-run and update UX. |
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
