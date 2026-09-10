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
    assert.equal("LoginForm" in picked, false);
  }
});

test("cabinet /home keeps Header.goHomeShort and CORE namespaces", () => {
  const picked = pickClientMessages(uk, "/home");

  assert.equal(
    (picked.Header as { goHomeShort: string }).goHomeShort,
    "Головна",
  );
  assert.ok(
    CORE_CLIENT_NAMESPACES.every((key) => key in picked),
    "core client namespaces must be present on /home",
  );
  assert.equal("LoginForm" in picked, false);
  assert.equal("WelcomeLanding" in picked, false);
  assert.equal("Metadata" in picked, false);
});

test("pickClientMessages adds route-only namespaces on auth and settings", () => {
  assert.ok("LoginForm" in pickClientMessages(uk, "/login"));
  assert.ok("RegisterForm" in pickClientMessages(uk, "/register"));
  assert.ok("TeacherRegister" in pickClientMessages(uk, "/register/teacher"));
  assert.ok(
    "TeacherRegister" in pickClientMessages(uk, "/register/teacher/success"),
  );
  assert.equal("RegisterForm" in pickClientMessages(uk, "/register/teacher"), false);
  assert.equal("TeacherRegister" in pickClientMessages(uk, "/register"), false);
  assert.ok("ContentImportForm" in pickClientMessages(uk, "/settings"));
  assert.ok("Diagnostic" in pickClientMessages(uk, "/diagnostic"));
  assert.ok("DiagnosticResult" in pickClientMessages(uk, "/diagnostic"));
  assert.equal("Header" in pickClientMessages(uk, "/login"), false);
  assert.equal("Header" in pickClientMessages(uk, "/diagnostic"), false);
});

test("CLIENT_MESSAGE_NAMESPACES still lists the full union for docs/tests", () => {
  assert.ok(CLIENT_MESSAGE_NAMESPACES.includes("LoginForm"));
  assert.ok(CLIENT_MESSAGE_NAMESPACES.includes("TeacherRegister"));
  assert.ok(CLIENT_MESSAGE_NAMESPACES.includes("Header"));
});
