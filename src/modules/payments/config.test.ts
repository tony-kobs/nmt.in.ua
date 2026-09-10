import assert from "node:assert/strict";
import test from "node:test";

import { readMonoAcquiringConfig } from "./config";
import { MONO_DEFAULT_BASE_URL } from "./constants";

test("readMonoAcquiringConfig treats whitespace token as missing", () => {
  const config = readMonoAcquiringConfig({
    MONO_ACQUIRING_TOKEN: "   ",
  });
  assert.equal(config.configured, false);
  assert.equal(config.token, "");
  assert.equal(config.baseUrl, MONO_DEFAULT_BASE_URL);
});

test("readMonoAcquiringConfig reads a live token from env without a hardcoded secret", () => {
  const config = readMonoAcquiringConfig({
    MONO_ACQUIRING_TOKEN: "from-env-only",
    MONO_ACQUIRING_BASE_URL: "https://api.monobank.ua/",
  });
  assert.equal(config.configured, true);
  assert.equal(config.token, "from-env-only");
  assert.equal(config.baseUrl, "https://api.monobank.ua");
});
