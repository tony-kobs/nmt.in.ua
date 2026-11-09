import assert from "node:assert/strict";
import test from "node:test";

import { contentSecurityPolicy, createRequestNonce } from "./contentSecurityPolicy";

/** Copied from Next's `getScriptNonceFromHeader` so a nonce we emit is one Next will stamp. */
const NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;

function directive(policy: string, name: string): string {
  const found = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `) || part === name);
  assert.ok(found, name);
  return found ?? "";
}

test("production script policy is a nonce plus strict-dynamic, without inline or eval", () => {
  const nonce = createRequestNonce();
  const policy = contentSecurityPolicy(nonce, false);
  const script = directive(policy, "script-src");
  assert.match(script, new RegExp(`'nonce-${nonce.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
  assert.match(script, /'strict-dynamic'/);
  assert.equal(script.includes("'unsafe-inline'"), false);
  assert.equal(script.includes("'unsafe-eval'"), false);
  const source = script.split(/\s+/).find((part) => part.startsWith("'nonce-"));
  assert.equal(source ? NONCE_SOURCE.test(source) : false, true);

  assert.match(directive(policy, "style-src"), /'unsafe-inline'/);
  assert.match(directive(policy, "form-action"), /https:\/\/secure\.wayforpay\.com/);
  assert.match(directive(policy, "img-src"), /data:/);
  assert.match(directive(policy, "font-src"), /data:/);
});

test("development script policy keeps eval for React refresh", () => {
  const policy = contentSecurityPolicy(createRequestNonce(), true);
  assert.match(directive(policy, "script-src"), /'unsafe-eval'/);
  assert.equal(directive(policy, "script-src").includes("'unsafe-inline'"), false);
});
