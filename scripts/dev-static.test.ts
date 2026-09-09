// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStaticMiddleware } from "./dev-static";

class Response extends Writable {
  statusCode = 200;
  headers = new Map<string, string | number>();
  chunks: Buffer[] = [];
  setHeader(name: string, value: string | number) { this.headers.set(name, value); }
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
    this.chunks.push(chunk);
    callback();
  }
  get body() { return Buffer.concat(this.chunks).toString(); }
}

let directory: string;
let root: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "meuxe-static-"));
  root = path.join(directory, "assets");
  fs.mkdirSync(path.join(root, "models"), { recursive: true });
  fs.writeFileSync(path.join(root, "models", "Haru model.json"), '{"model":"Haru"}');
  fs.writeFileSync(path.join(directory, "secret.txt"), "private");
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

async function request(url: string, roots = [root], method = "GET") {
  const response = new Response();
  const finished = once(response, "finish");
  createStaticMiddleware(roots)(
    { url, method } as IncomingMessage,
    response as unknown as ServerResponse,
    () => { response.statusCode = 404; response.end(); },
  );
  await finished;
  return response;
}

describe("development asset middleware", () => {
  it("serves encoded asset names with cache-busting queries", async () => {
    const response = await request("/models/Haru%20model.json?t=123");
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"model":"Haru"}');
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it.each([
    "/../secret.txt", "/models/../../secret.txt", "/%2e%2e/secret.txt",
    "/models/%2E%2e%2fsecret.txt", "/..%5csecret.txt", "/models\\..\\secret.txt",
    "/%2fetc/passwd", "//etc/passwd", "/C:/secret.txt", "/C:secret.txt",
    "/%5c%5cserver/share", "/models/%00.json", "/models/%ZZ", "/models/%E0%A4%A",
  ])("rejects invalid or escaping paths: %s", async (url) => {
    const response = await request(url);
    expect(response.statusCode).toBe(400);
    expect(response.body).toBe("Invalid asset path");
  });

  it("does not decode an encoded traversal a second time", async () => {
    const response = await request("/%252e%252e/secret.txt");
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("private");
  });

  it("rejects a symlink to a sibling whose name starts with the root name", async () => {
    const outside = `${root}-private`;
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "private");
    fs.symlinkSync(outside, path.join(root, "escape"), "junction");
    const response = await request("/escape/secret.txt");
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("private");
  });

  it("allows symlinks that stay inside the root and symlinked roots", async () => {
    fs.symlinkSync(path.join(root, "models"), path.join(root, "alias"), "junction");
    const rootAlias = path.join(directory, "root-alias");
    fs.symlinkSync(root, rootAlias, "junction");
    expect((await request("/alias/Haru%20model.json", [rootAlias])).statusCode).toBe(200);
  });

  it("preserves root precedence and falls back across absent roots", async () => {
    const fallback = path.join(directory, "fallback");
    fs.mkdirSync(fallback);
    fs.writeFileSync(path.join(root, "same.json"), "first");
    fs.writeFileSync(path.join(fallback, "same.json"), "second");
    const roots = [path.join(directory, "missing"), root, fallback];
    expect((await request("/same.json", roots)).body).toBe("first");
    fs.rmSync(path.join(root, "same.json"));
    expect((await request("/same.json", roots)).body).toBe("second");
  });

  it("passes missing files and directories through and handles preflight", async () => {
    expect((await request("/models/missing.json")).statusCode).toBe(404);
    expect((await request("/models")).statusCode).toBe(404);
    const response = await request("/models/Haru%20model.json", [root], "OPTIONS");
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
});
