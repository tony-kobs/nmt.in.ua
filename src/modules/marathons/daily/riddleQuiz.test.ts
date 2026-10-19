import assert from "node:assert/strict";
import test from "node:test";

import {
  answerRiddle,
  buildLandingPayload,
  createRiddleSession,
  gradeRiddleAttempt,
  isQuizReady,
  mulberry32,
  presentRiddle,
  publicRiddleLeaks,
  readRiddleToken,
  RIDDLE_COOLDOWN_MS,
  shuffle,
  signRiddleSession,
  takeRandom,
  type StoredRiddle,
} from "./riddleQuiz";

const SECRET = "riddle-test-secret";

function riddle(overrides: Partial<StoredRiddle> = {}): StoredRiddle {
  return {
    id: 7,
    title: "Зерна",
    body: "Скільки зерен на 64-й клітині і на всій шахівниці?",
    hint: "Геометрична прогресія зі знаменником 2.",
    legacyAnswer: "На останній клітині 2^63. Усього 2^64 − 1.",
    subject: "math",
    shared: true,
    options: [
      { id: 1, label: "2^64 і 2^64", correct: false },
      { id: 2, label: "2^63 і 2^64 − 1", correct: true },
      { id: 3, label: "64^2 і 64 × 64", correct: false },
    ],
    ...overrides,
  };
}

test("shuffle is a stable permutation and takeRandom keeps the requested size", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const first = shuffle(items, mulberry32(1));
  const again = shuffle(items, mulberry32(1));
  assert.deepEqual(first, again);
  assert.deepEqual([...first].sort((a, b) => a - b), items);
  assert.notDeepEqual(first, shuffle(items, mulberry32(2)));

  const picked = takeRandom(items, 3, mulberry32(4));
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  for (const item of picked) assert.ok(items.includes(item));
  assert.deepEqual(takeRandom(items, 3, mulberry32(4)), picked);
  assert.equal(takeRandom(items, 0, mulberry32(4)).length, 0);
  assert.equal(takeRandom(items, 20, mulberry32(4)).length, items.length);
});

test("a quiz needs 2–6 options and exactly one correct", () => {
  assert.equal(isQuizReady(riddle()), true);
  assert.equal(isQuizReady(riddle({ options: riddle().options.slice(0, 1) })), false);
  assert.equal(
    isQuizReady(riddle({
      options: [
        { id: 1, label: "а", correct: true },
        { id: 2, label: "б", correct: true },
      ],
    })),
    false,
  );
  assert.equal(isQuizReady(riddle({ options: [] })), false);
});

test("the landing payload shuffles options and hides the key, the hint, and the old answer", () => {
  const pool = [riddle(), riddle({ id: 8, title: "Інша", options: [] })];
  const now = 1_700_000_000_000;
  const payload = buildLandingPayload(pool, 3, null, now, mulberry32(9));
  assert.equal(payload.length, 2);
  const quiz = payload.find((item) => item.mode === "quiz");
  const text = payload.find((item) => item.mode === "text");
  assert.ok(quiz && quiz.mode === "quiz" && quiz.solved === false);
  assert.ok(text && text.mode === "text");
  if (!quiz || quiz.mode !== "quiz" || quiz.solved) return;
  assert.deepEqual(
    quiz.options.map((option) => option.id).sort((a, b) => a - b),
    [1, 2, 3],
  );
  assert.notDeepEqual(
    quiz.options.map((option) => option.id),
    [1, 2, 3],
  );
  const json = JSON.stringify(payload);
  assert.equal(json.includes("is_correct"), false);
  assert.equal(json.includes("legacyAnswer"), false);
  assert.equal(json.includes("Геометрична прогресія"), false);
  assert.equal(json.includes("2^64 − 1."), false);
  assert.deepEqual(publicRiddleLeaks(payload, [
    "Геометрична прогресія зі знаменником 2.",
    "На останній клітині 2^63. Усього 2^64 − 1.",
  ]), []);
  assert.equal("correct" in quiz, false);
});

test("a correct guess is the first moment the explanation may leave the server", () => {
  const now = 5_000_000;
  const session = createRiddleSession(now);
  const shown = presentRiddle(riddle(), session, now, mulberry32(3));
  assert.equal(shown.mode === "quiz" && shown.solved === false, true);
  const graded = gradeRiddleAttempt({
    riddle: riddle(),
    optionId: 2,
    session,
    nowMs: now,
  });
  assert.equal(graded.result.status, "correct");
  if (graded.result.status !== "correct") return;
  assert.equal(graded.result.hint, "Геометрична прогресія зі знаменником 2.");
  assert.equal(JSON.stringify(graded.result).includes("legacyAnswer"), false);
  const revealed = presentRiddle(riddle(), graded.session, now, mulberry32(3));
  assert.equal(revealed.mode === "quiz" && revealed.solved, true);
  if (revealed.mode !== "quiz" || !revealed.solved) return;
  assert.equal(revealed.hint, graded.result.hint);
  assert.deepEqual(publicRiddleLeaks([revealed], [
    "На останній клітині 2^63. Усього 2^64 − 1.",
  ]), []);
});

test("a wrong guess locks the riddle for 10 seconds even if the next click is right", () => {
  const now = 9_000_000;
  const session = createRiddleSession(now);
  const wrong = answerRiddle({
    riddle: riddle(),
    optionId: 1,
    session,
    nowMs: now,
  });
  assert.deepEqual(wrong.result, { status: "wrong", retryAt: now + RIDDLE_COOLDOWN_MS });
  assert.equal(JSON.stringify(wrong.result).includes("2^63"), false);

  const during = answerRiddle({
    riddle: riddle(),
    optionId: 2,
    session: wrong.session,
    nowMs: now + 1_000,
  });
  assert.equal(during.result.status, "locked");
  if (during.result.status !== "locked") return;
  assert.equal(during.result.retryAt, now + RIDDLE_COOLDOWN_MS);
  assert.equal("hint" in during.result, false);
  assert.equal(during.session, wrong.session);

  const fresh = answerRiddle({
    riddle: riddle(),
    optionId: 2,
    session: createRiddleSession(now),
    nowMs: now + 1_000,
  });
  assert.equal(fresh.result.status, "correct");

  const later = answerRiddle({
    riddle: riddle(),
    optionId: 2,
    session: wrong.session,
    nowMs: now + RIDDLE_COOLDOWN_MS,
  });
  assert.equal(later.result.status, "correct");
});

test("an option from another riddle and a riddle without choices are rejected", () => {
  const now = 10_000;
  const session = createRiddleSession(now);
  const foreign = gradeRiddleAttempt({
    riddle: riddle(),
    optionId: 99,
    session,
    nowMs: now,
  });
  assert.deepEqual(foreign.result, { status: "invalid" });
  assert.equal(foreign.session, session);
  const missing = answerRiddle({ riddle: null, optionId: 2, session, nowMs: now });
  assert.deepEqual(missing.result, { status: "invalid" });
  const text = answerRiddle({
    riddle: riddle({ options: [] }),
    optionId: 2,
    session,
    nowMs: now,
  });
  assert.deepEqual(text.result, { status: "invalid" });
});

test("a signed session survives a round trip and a tampered lock does not", () => {
  const now = 1_800_000_000_000;
  const session = {
    ...createRiddleSession(now),
    sid: "session-1234",
    locks: { "7": now + RIDDLE_COOLDOWN_MS },
    solved: { "4": 2 },
  };
  const token = signRiddleSession(session, SECRET);
  assert.deepEqual(readRiddleToken(token, SECRET, now), session);
  assert.equal(readRiddleToken(token, "other-secret", now), null);
  const forged = `${token.slice(0, -4)}aaaa`;
  assert.equal(readRiddleToken(forged, SECRET, now), null);
  assert.equal(readRiddleToken(token, SECRET, (session.exp + 5) * 1000), null);
});
