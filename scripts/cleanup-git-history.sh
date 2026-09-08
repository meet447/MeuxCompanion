#!/usr/bin/env bash
# Purge large accidental blobs from Git history (Rust target/ + Whisper weights).
#
# This rewrites history. Everyone must re-clone or hard-reset after you force-push.
#
# Usage:
#   ./scripts/cleanup-git-history.sh --dry-run   # show what would be removed
#   ./scripts/cleanup-git-history.sh             # rewrite local history
#
# After a successful run:
#   git push origin --force --all
#   git push origin --force --tags
#
# Requires: git-filter-repo (pip install git-filter-repo)

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

if ! command -v git-filter-repo >/dev/null; then
  echo "Install git-filter-repo first:" >&2
  echo "  pip install git-filter-repo" >&2
  echo "  # or: brew install git-filter-repo" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

echo "== Blobs to purge =="
echo "  - meuxcompanion-desktop/target/   (~2.7 GB historical Rust build output)"
echo "  - models/whisper/ggml-tiny.bin    (~74 MB; now downloaded on first mic use)"
echo ""

echo "== Current pack size =="
git count-objects -vH | grep size-pack || true
echo ""

if $DRY_RUN; then
  echo "Dry run: listing paths that would be removed from history ..."
  git rev-list --objects --all \
    | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
    | awk '/^blob/ && ($4 ~ /^meuxcompanion-desktop\/target\// || $4 == "models\/whisper\/ggml-tiny.bin") {count++; bytes+=$3} END {printf "  %d blobs, %.1f MB\n", count, bytes/1024/1024}'
  echo ""
  echo "Re-run without --dry-run to rewrite history locally."
  exit 0
fi

read -r -p "Rewrite local history? This cannot be undone without a backup. [y/N] " confirm
if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Creating local backup bundle ..."
git bundle create "../meuxe-pre-cleanup-$(date +%Y%m%d).bundle" --all

echo "Running git-filter-repo ..."
git filter-repo --force --invert-paths \
  --path meuxcompanion-desktop/target/ \
  --path models/whisper/ggml-tiny.bin

echo ""
echo "== New pack size =="
git count-objects -vH | grep size-pack || true

echo ""
echo "Done locally. Next steps:"
echo "  1. Verify: git log --oneline -5 && npm test"
echo "  2. Force-push: git push origin --force --all && git push origin --force --tags"
echo "  3. Tell collaborators to re-clone (or: git fetch && git reset --hard origin/main)"
echo "  4. On GitHub: Settings → General → check repo size after a few minutes"
