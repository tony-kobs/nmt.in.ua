import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { WWW_HOST, wwwRedirectLocation } = require("./wwwRedirect.cjs");

const root = path.resolve(process.cwd());

test("www host redirects to the apex and keeps path and query", () => {
  assert.equal(
    wwwRedirectLocation({ host: "www.nmt.in.ua" }, "/about?plan=a%20b&x=1"),
    "https://nmt.in.ua/about?plan=a%20b&x=1",
  );
  assert.equal(
    wwwRedirectLocation({ host: "WWW.nmt.in.ua:443" }, "/pricing"),
    "https://nmt.in.ua/pricing",
  );
  assert.equal(wwwRedirectLocation({ host: WWW_HOST }, "/"), "https://nmt.in.ua/");
  assert.equal(wwwRedirectLocation({ host: WWW_HOST }, ""), "https://nmt.in.ua/");
});

test("x-forwarded-host wins when the proxy rewrites Host to the upstream", () => {
  assert.equal(
    wwwRedirectLocation(
      { host: "127.1.10.37:3000", "x-forwarded-host": "www.nmt.in.ua" },
      "/teacher?ref=mikhail",
    ),
    "https://nmt.in.ua/teacher?ref=mikhail",
  );
  assert.equal(
    wwwRedirectLocation(
      { host: "nmt.in.ua", "x-forwarded-host": "www.nmt.in.ua, nmt.in.ua" },
      "/diagnostic",
    ),
    "https://nmt.in.ua/diagnostic",
  );
});

test("apex and other hosts stay on the app", () => {
  for (const host of ["nmt.in.ua", "127.1.10.37:3000", "localhost:3000", "www.nmt.in.ua.evil.test"]) {
    assert.equal(wwwRedirectLocation({ host }, "/about"), null, host);
  }
  assert.equal(
    wwwRedirectLocation({ host: "nmt.in.ua", "x-forwarded-host": "nmt.in.ua" }, "/about?x=1"),
    null,
  );
});

test("redirect target ignores absolute and protocol-relative request urls", () => {
  assert.equal(wwwRedirectLocation({ host: WWW_HOST }, "https://evil.test/phish"), "https://nmt.in.ua/");
  assert.equal(wwwRedirectLocation({ host: WWW_HOST }, "//evil.test/phish"), "https://nmt.in.ua/");
  const injected = `/ok${String.fromCharCode(13, 10)}Location: https://evil.test`;
  assert.equal(wwwRedirectLocation({ host: WWW_HOST }, injected), "https://nmt.in.ua/");
});

test("next config and the custom server both name a 301 for www", () => {
  const config = readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.match(config, /statusCode:\s*301/);
  assert.match(config, /value:\s*"www\.nmt\.in\.ua"/);
  assert.equal(config.includes("permanent: true"), false);
  const server = readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /wwwRedirectLocation/);
  assert.match(server, /writeHead\(301/);
});
