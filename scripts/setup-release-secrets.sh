#!/usr/bin/env bash
# Configure GitHub Actions secrets for signed Tauri releases.
# Requires: gh CLI authenticated with admin access to the repository.
#
# Usage:
#   ./scripts/setup-release-secrets.sh
#   PRIVATE_KEY_FILE=~/.tauri/meuxe-updater.key ./scripts/setup-release-secrets.sh
#
# If no key file exists, generates one at ~/.tauri/meuxe-updater.key and prints
# the public key — update src-tauri/tauri.conf.json if it does not match.

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-meet447/Meuxe}"
KEY_DIR="${HOME}/.tauri"
KEY_FILE="${PRIVATE_KEY_FILE:-${KEY_DIR}/meuxe-updater.key}"
PUBKEY_FILE="${KEY_FILE}.pub"
CONF_PUBKEY=$(node -e "
  const fs = require('fs');
  const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  process.stdout.write(conf.plugins?.updater?.pubkey ?? '');
")

if [[ -z "${CONF_PUBKEY}" ]]; then
  echo "error: plugins.updater.pubkey not found in src-tauri/tauri.conf.json" >&2
  exit 1
fi

if ! command -v gh >/dev/null; then
  echo "error: install GitHub CLI (gh) and run: gh auth login" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

mkdir -p "${KEY_DIR}"

if [[ ! -f "${KEY_FILE}" ]]; then
  echo "Generating updater signing key at ${KEY_FILE} ..."
  npx tauri signer generate -w "${KEY_FILE}" -p "" -f --ci
fi

FILE_PUBKEY=$(tr -d '\n' < "${PUBKEY_FILE}")
if [[ "${FILE_PUBKEY}" != "${CONF_PUBKEY}" ]]; then
  echo "error: public key in ${PUBKEY_FILE} does not match src-tauri/tauri.conf.json" >&2
  echo "Either update plugins.updater.pubkey to:" >&2
  echo "${FILE_PUBKEY}" >&2
  echo "Or set PRIVATE_KEY_FILE to the key that matches the committed pubkey." >&2
  exit 1
fi

echo "Setting repository secrets on ${REPO} ..."

gh secret set TAURI_SIGNING_PRIVATE_KEY --repo "${REPO}" < "${KEY_FILE}"
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo "${REPO}" --body ""

echo "Done. Secrets configured:"
gh secret list --repo "${REPO}" | grep -E 'TAURI_SIGNING|^NAME' || true
echo ""
echo "Next: tag a release to trigger CI, e.g."
echo "  git tag v0.1.1 && git push origin v0.1.1"
