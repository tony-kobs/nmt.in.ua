import assert from "node:assert/strict";
import test from "node:test";

import {
  isReservedTeacherSlug,
  normalizeSlug,
  parseSubjects,
  validateTeacherProfileInput,
} from "./validateProfile";

function validInput(
  overrides: Partial<Parameters<typeof validateTeacherProfileInput>[0]> = {},
) {
  return {
    slug: "igor-petrenko",
    headline: "Репетитор з математики",
    bio: "Готую до НМТ.",
    city: "Запоріжжя",
    subjects: "Алгебра, Геометрія",
    contactUrl: "https://example.com/igor",
    isPublic: true,
    ...overrides,
  };
}

test("normalizeSlug lowercases, trims, and collapses spaces to one hyphen", () => {
  assert.equal(normalizeSlug("  Ihor  Petrenko "), "ihor-petrenko");
  assert.equal(normalizeSlug("A---B"), "a-b");
});

test("parseSubjects splits on commas and drops duplicates", () => {
  assert.deepEqual(parseSubjects("Алгебра, геометрія; Алгебра\nСтереометрія"), [
    "Алгебра",
    "геометрія",
    "Стереометрія",
  ]);
});

test("validateTeacherProfileInput accepts a complete public card", () => {
  const result = validateTeacherProfileInput(validInput());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      slug: "igor-petrenko",
      headline: "Репетитор з математики",
      bio: "Готую до НМТ.",
      city: "Запоріжжя",
      subjects: ["Алгебра", "Геометрія"],
      contactUrl: "https://example.com/igor",
      isPublic: true,
    });
  }
});

test("validateTeacherProfileInput requires a slug even when unpublished", () => {
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "  ", isPublic: false })), {
    ok: false,
    code: "slugRequired",
  });
});

test("validateTeacherProfileInput rejects short, unicode, and double-hyphen slugs", () => {
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "ab" })), {
    ok: false,
    code: "invalidSlug",
  });
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "ігор" })), {
    ok: false,
    code: "invalidSlug",
  });
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "igor--petrenko" })), {
    ok: false,
    code: "invalidSlug",
  });
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "-igor" })), {
    ok: false,
    code: "invalidSlug",
  });
});

test("validateTeacherProfileInput rejects reserved product slugs", () => {
  assert.equal(isReservedTeacherSlug("login"), true);
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "account" })), {
    ok: false,
    code: "reservedSlug",
  });
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "t" })), {
    ok: false,
    code: "invalidSlug",
  });
});

test("validateTeacherProfileInput rejects oversized copy and bad contact URL", () => {
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ headline: "x".repeat(161) })),
    { ok: false, code: "headlineTooLong" },
  );
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ bio: "x".repeat(2001) })),
    { ok: false, code: "bioTooLong" },
  );
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ city: "x".repeat(81) })),
    { ok: false, code: "cityTooLong" },
  );
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ contactUrl: "javascript:alert(1)" })),
    { ok: false, code: "invalidContactUrl" },
  );
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ contactUrl: "not-a-url" })),
    { ok: false, code: "invalidContactUrl" },
  );
});

test("validateTeacherProfileInput rejects too many or too long subjects", () => {
  assert.deepEqual(
    validateTeacherProfileInput(
      validInput({ subjects: Array.from({ length: 9 }, (_, i) => `Тема ${i}`).join(", ") }),
    ),
    { ok: false, code: "invalidSubjects" },
  );
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ subjects: "x".repeat(41) })),
    { ok: false, code: "invalidSubjects" },
  );
});

test("validateTeacherProfileInput allows empty optional fields", () => {
  const result = validateTeacherProfileInput(
    validInput({
      headline: "",
      bio: "",
      city: "",
      subjects: "",
      contactUrl: "",
      isPublic: false,
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.isPublic, false);
    assert.deepEqual(result.value.subjects, []);
    assert.equal(result.value.contactUrl, "");
  }
});
