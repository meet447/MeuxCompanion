# Cleaning up repository history

The Meuxe remote is ~1 GB because large files were committed once and later removed from the tree, but **Git still stores them in history**.

| Path | Size in history | Still tracked at HEAD? |
|------|-----------------|------------------------|
| `meuxcompanion-desktop/target/` | ~2.7 GB | No (removed in `2ef16bc`) |
| `models/whisper/ggml-tiny.bin` | ~74 MB | No (removed in `fd2ef80`, now gitignored) |
| Bundled models (`models/vrm/`, `models/live2d/haru/`) | ~30 MB | Yes (intentional) |

Current tracked files at `HEAD` are only **~32 MB**. Cleaning history brings clone size down to roughly that range.

## Quick path (recommended)

On a machine with **admin** access to the repo:

```bash
pip install git-filter-repo   # or: brew install git-filter-repo

git checkout main
git pull origin main

# Preview what will be removed
./scripts/cleanup-git-history.sh --dry-run

# Rewrite local history (creates a backup bundle in the parent directory)
./scripts/cleanup-git-history.sh

# Sanity check
npm test
git count-objects -vH   # size-pack should drop from ~978 MiB to tens of MiB

# Publish rewritten history
git push origin --force --all
git push origin --force --tags
```

## After force-push

Everyone with an existing clone must reset or re-clone:

```bash
# Option A — re-clone (simplest)
rm -rf Meuxe && git clone https://github.com/meet447/Meuxe.git

# Option B — reset in place
git fetch origin
git checkout main
git reset --hard origin/main
```

Open PR branches based on the old history will need to be rebased onto the new `main` or closed and re-opened.

## Manual alternative (BFG)

```bash
brew install bfg   # or download bfg jar

git clone --mirror https://github.com/meet447/Meuxe.git meuxe-mirror.git
cd meuxe-mirror.git

bfg --delete-folders target --delete-files ggml-tiny.bin
git reflog expire --expire=now --all && git gc --prune=now --aggressive

cd ..
git clone meuxe-mirror.git Meuxe-clean
cd Meuxe-clean
git push origin --force --all
git push origin --force --tags
```

Use `target` folder name carefully — BFG matches any folder named `target`. Our historical bloat is only under `meuxcompanion-desktop/target/`, so `git-filter-repo` with an explicit path is safer.

## Prevent recurrence

`.gitignore` already excludes `target/`, `src-tauri/target/`, and `models/whisper/*.bin`. Optional hardening:

```bash
# Reject commits that add build output or large binaries
cat >> .git/hooks/pre-commit <<'EOF'
#!/bin/sh
if git diff --cached --name-only | grep -E '(^|/)target/|\.(bin|ggml|gguf)$'; then
  echo "Blocked: build artifacts or model weights" >&2
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

## GitHub note

After force-push, GitHub may take a few minutes to recalculate repository size under **Settings → General**. If it stays large, contact GitHub support to run garbage collection on the server side.
