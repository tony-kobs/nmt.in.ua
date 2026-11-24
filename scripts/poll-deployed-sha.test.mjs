import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "./test-run.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/poll-deployed-sha.sh");
const EXPECTED = "a".repeat(40);
const PREVIOUS = "b".repeat(40);

function listen(handler) {
  let count = 0;
  const server = createServer((req, res) => {
    count += 1;
    const reply = handler(count);
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(reply.body);
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("test server has no port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/api/version`,
        count: () => count,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

function pollEnv(url, extra = {}) {
  return {
    ...process.env,
    VERSION_URL: url,
    EXPECTED_SHA: EXPECTED,
    POLL_INTERVAL_SECONDS: "0.05",
    POLL_TIMEOUT_SECONDS: "2",
    ...extra,
  };
}

test("404s keep waiting until the deployed sha appears", async () => {
  const server = await listen((request) => {
    if (request < 3) return { status: 404, body: "missing" };
    return { status: 200, body: JSON.stringify({ sha: EXPECTED, version: "v0.1.0" }) };
  });
  try {
    const result = await run("bash", [script], { env: pollEnv(server.url), timeout: 8_000 });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /404/);
    assert.match(result.stdout, new RegExp(`confirmed \\(${EXPECTED}\\)`));
  } finally {
    await server.close();
  }
});

test("a sha that stays on the previous revision fails as a rollback", async () => {
  const server = await listen(() => ({
    status: 200,
    body: JSON.stringify({ sha: PREVIOUS, version: null }),
  }));
  try {
    const result = await run("bash", [script], { env: pollEnv(server.url), timeout: 8_000 });
    assert.equal(result.code, 1);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /Deploy failed or rolled back/);
    assert.match(output, new RegExp(`stayed at ${PREVIOUS}`));
  } finally {
    await server.close();
  }
});

test("a bad expected sha fails before polling", async () => {
  const result = await run("bash", [script], {
    env: pollEnv("http://127.0.0.1:9/api/version", {
      EXPECTED_SHA: "short",
      POLL_TIMEOUT_SECONDS: "30",
    }),
    timeout: 3_000,
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not a full commit SHA/);
});
