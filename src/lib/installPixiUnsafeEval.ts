import { install } from "@pixi/unsafe-eval";
import * as PIXI from "pixi.js";

/** PixiJS v6 compiles shaders with `new Function()`, which Tauri CSP (`script-src 'self'`) blocks. */

let installed = false;

export function installPixiUnsafeEval(): void {
  if (installed) {
    return;
  }
  install(PIXI);
  installed = true;
}

installPixiUnsafeEval();
