import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioHttpHandler } from "../lib/routes/studio-http-handler.mjs";

function makeResponseRecorder() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("studio http handler rejects unsafe project id before route dispatch", async () => {
  const calls = [];
  const handler = createStudioHttpHandler({
    port: 4173,
    publicDir: "/tmp/public",
    readFile: async () => Buffer.from("ignored"),
    sendJson: (_res, status, payload) => calls.push({ status, payload }),
    handleStudioApiRoute: async () => {
      throw new Error("should not run");
    },
    publicAssetForPath: () => null,
    isSafeProjectId: () => false,
    studioApiContext: {},
  });
  const res = makeResponseRecorder();
  await handler({ url: "/api/projects/bad/plan" }, res);
  assert.deepEqual(calls, [
    { status: 400, payload: { ok: false, message: "Invalid project id." } },
  ]);
});

test("studio http handler returns API not-found payload for unmatched API routes", async () => {
  const calls = [];
  const handler = createStudioHttpHandler({
    port: 4173,
    publicDir: "/tmp/public",
    readFile: async () => Buffer.from("ignored"),
    sendJson: (_res, status, payload) => calls.push({ status, payload }),
    handleStudioApiRoute: async () => false,
    publicAssetForPath: () => null,
    isSafeProjectId: () => true,
    studioApiContext: {},
  });
  const res = makeResponseRecorder();
  await handler({ url: "/api/unknown" }, res);
  assert.deepEqual(calls, [{ status: 404, payload: { ok: false, message: "Not found." } }]);
});

test("studio http handler serves static assets through writeHead/end", async () => {
  const calls = [];
  const handler = createStudioHttpHandler({
    port: 4173,
    publicDir: "/tmp/public",
    readFile: async () => Buffer.from("static"),
    sendJson: (_res, status, payload) => calls.push({ status, payload }),
    handleStudioApiRoute: async () => false,
    publicAssetForPath: () => ({ filePath: "/tmp/public/app.js", contentType: "text/javascript" }),
    isSafeProjectId: () => true,
    studioApiContext: {},
  });
  const res = makeResponseRecorder();
  await handler({ url: "/app.js" }, res);
  assert.equal(calls.length, 0);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.headers, { "content-type": "text/javascript" });
  assert.equal(String(res.body), "static");
});

test("studio http handler reports server errors as 500 json", async () => {
  const calls = [];
  const handler = createStudioHttpHandler({
    port: 4173,
    publicDir: "/tmp/public",
    readFile: async () => Buffer.from("ignored"),
    sendJson: (_res, status, payload) => calls.push({ status, payload }),
    handleStudioApiRoute: async () => {
      throw new Error("boom");
    },
    publicAssetForPath: () => null,
    isSafeProjectId: () => true,
    studioApiContext: {},
  });
  const res = makeResponseRecorder();
  await handler({ url: "/api/projects/demo/jobs" }, res);
  assert.deepEqual(calls, [{ status: 500, payload: { ok: false, message: "boom" } }]);
});
