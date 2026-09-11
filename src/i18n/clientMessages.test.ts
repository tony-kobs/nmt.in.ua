import assert from "node:assert/strict";
import test from "node:test";

import uk from "../../messages/uk.json";
import {
  CLIENT_MESSAGE_NAMESPACES,
  CORE_CLIENT_NAMESPACES,
  PUBLIC_CLIENT_NAMESPACES,
  pickClientMessages,
} from "./clientMessages";

test("guest / and /welcome stay on the slim public client payload", () => {
  for (const path of ["/", "/welcome"] as const) {
    const picked = pickClientMessages(uk, path);
    assert.ok(PUBLIC_CLIENT_NAMESPACES.every((key) => key in picked));
    assert.equal("Header" in picked, false);
    assert.equal("TopicTrainer" in picked, false);
    assert.ok("LoginForm" in picked);
    assert.ok("RegisterForm" in picked);
  }
});

test("cabinet /home keeps Header.goHomeShort and CORE namespaces", () => {
  const picked = pickClientMessages(uk, "/home");

  assert.equal(
    (picked.Header as { goHomeShort: string }).goHomeShort,
    "Вітальна",
  );
  assert.ok(
    CORE_CLIENT_NAMESPACES.every((key) => key in picked),
    "core client namespaces must be present on /home",
  );
  assert.equal("LoginForm" in picked, false);
  assert.equal("WelcomeLanding" in picked, false);
  assert.equal("Metadata" in picked, false);
});

test("pickClientMessages keeps shared marketing namespaces on auth and diagnostic", () => {
  for (const path of ["/login", "/register", "/diagnostic"] as const) {
    const picked = pickClientMessages(uk, path);
    assert.ok(PUBLIC_CLIENT_NAMESPACES.every((key) => key in picked));
    assert.equal("Header" in picked, false);
  }
  assert.ok("ContentImportForm" in pickClientMessages(uk, "/settings"));
});

test("/diagnostic ships the TopicTrainer namespace the session page renders", () => {
  for (const path of ["/diagnostic", "/diagnostic/session/1"] as const) {
    const picked = pickClientMessages(uk, path);
    assert.ok(
      "TopicTrainer" in picked,
      `${path} must include TopicTrainer or its header/actions render raw keys`,
    );
  }
});

test("CLIENT_MESSAGE_NAMESPACES still lists the full union for docs/tests", () => {
  assert.ok(CLIENT_MESSAGE_NAMESPACES.includes("LoginForm"));
  assert.ok(CLIENT_MESSAGE_NAMESPACES.includes("Header"));
});
