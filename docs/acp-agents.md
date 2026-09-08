# ACP CLI agents (Meuxe presets)

Chat runs only through the [Agent Client Protocol](https://agentclientprotocol.com). Meuxe is the ACP **client**; the preset picks which **agent** subprocess to spawn.

## Resolution order (global-first)

For each preset, Meuxe picks the first match:

1. **System / global** — executable on `PATH`, plus extra directories Meuxe prepends so Dock / `.desktop` launches still work:
   `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.npm-global/bin`, `~/bin`, `$NPM_CONFIG_PREFIX/bin`, nvm/fnm/volta/pnpm/bun install dirs
2. **npx** — Claude and Codex only, when Node/npx is available and no binary was found

If nothing is found, chat shows an error. Install from **Onboarding** or **Settings → Agent** (the Install button). Chat does **not** install an agent in the background.

Restart the app if a newly installed CLI is not detected immediately.

| Preset | System binary name | Global install example |
|--------|-------------------|-------------------------|
| `opencode` | `opencode` | `npm i -g opencode-ai` |
| `claude` | `claude-agent-acp` | `npm i -g @agentclientprotocol/claude-agent-acp` |
| `codex` | `codex-acp` | `npm i -g @agentclientprotocol/codex-acp` |
| `custom` | User-defined command + args | Your PATH or a full path |

OpenCode is launched as `{binary} acp`. Claude/Codex adapters are launched as a single executable when found globally.

You can paste a full path in Settings if detection still fails.

Persona and memory context are written under `data_dir/companion-home/` before each turn; the session working directory is that tree.
