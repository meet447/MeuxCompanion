import { spawnSync } from "node:child_process";

const result = spawnSync("cargo", ["test", "-p", "meuxe-core", "ipc_types_match_rust"], {
  stdio: "inherit",
  env: { ...process.env, MEUXE_UPDATE_TYPES: "1" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
