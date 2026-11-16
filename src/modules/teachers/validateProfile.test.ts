import assert from "node:assert/strict";
import test from "node:test";

import {
  isReservedTeacherSlug,
  normalizeSlug,
  parseSubjects,
  validateTeacherProfileInput,
  validateTeacherProfileSubmission,
} from "./validateProfile";

function validInput(
  overrides: Partial<Parameters<typeof validateTeacherProfileInput>[0]> = {},
) {
  return {
    slug: "igor-petrenko",
    headline: "Репетитор з математики",
    bio: "Готую до НМТ.",
    experience: "5 років",
    publications: "",
    city: "Запоріжжя",
    country: "Україна",
    subjects: "Алгебра, Геометрія",
    teachingLevels: ["grades_10_11", "nmt"],
    teachingLanguages: ["uk"],
    contactUrl: "https://example.com/igor",
    phone: "+380 67 123 45 67",
    lessonPrice: "500",
    lessonCurrency: "UAH",
    lessonDurationMinutes: "60",
    joinMotivation: "Хочу допомагати учням готуватися до НМТ.",
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

test("validateTeacherProfileInput accepts a complete teacher profile", () => {
  const result = validateTeacherProfileInput(validInput());

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value, {
      slug: "igor-petrenko",
      headline: "Репетитор з математики",
      bio: "Готую до НМТ.",
      experience: "5 років",
      publications: "",
      city: "Запоріжжя",
      country: "Україна",
      subjects: ["Алгебра", "Геометрія"],
      teachingLevels: ["grades_10_11", "nmt"],
      teachingLanguages: ["uk"],
      contactUrl: "https://example.com/igor",
      externalUrl: "",
      photoUrl: "",
      about: "",
      approach: "",
      program: "",
      reviews: [],
      phone: "+380 67 123 45 67",
      lessonPrice: 500,
      lessonCurrency: "UAH",
      lessonDurationMinutes: 60,
      joinMotivation: "Хочу допомагати учням готуватися до НМТ.",
    });
  }
});

test("validateTeacherProfileInput requires a slug", () => {
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "  " })), {
    ok: false,
    code: "slugRequired",
  });
});

test("validateTeacherProfileInput rejects short, unicode, and edge slugs", () => {
  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "ab" })), {
    ok: false,
    code: "invalidSlug",
  });

  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "ігор" })), {
    ok: false,
    code: "invalidSlug",
  });

  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "-igor" })), {
    ok: false,
    code: "invalidSlug",
  });

  assert.deepEqual(validateTeacherProfileInput(validInput({ slug: "igor-" })), {
    ok: false,
    code: "invalidSlug",
  });
});

test("validateTeacherProfileInput collapses repeated hyphens in the slug", () => {
  const result = validateTeacherProfileInput(
    validInput({ slug: "igor--petrenko" }),
  );

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.value.slug, "igor-petrenko");
  }
});

test("validateTeacherProfileInput rejects reserved product slugs", () => {
  assert.equal(isReservedTeacherSlug("login"), true);

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ slug: "account" })),
    {
      ok: false,
      code: "reservedSlug",
    },
  );

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
    validateTeacherProfileInput(validInput({ country: "x".repeat(81) })),
    { ok: false, code: "countryTooLong" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(
      validInput({ contactUrl: "javascript:alert(1)" }),
    ),
    { ok: false, code: "invalidContactUrl" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ contactUrl: "not-a-url" })),
    { ok: false, code: "invalidContactUrl" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(
      validInput({ joinMotivation: "x".repeat(2001) }),
    ),
    { ok: false, code: "joinMotivationTooLong" },
  );
});

test("validateTeacherProfileInput rejects too many or too long subjects", () => {
  assert.deepEqual(
    validateTeacherProfileInput(
      validInput({
        subjects: Array.from({ length: 9 }, (_, i) => `Тема ${i}`).join(", "),
      }),
    ),
    { ok: false, code: "invalidSubjects" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ subjects: "x".repeat(41) })),
    { ok: false, code: "invalidSubjects" },
  );
});

test("validateTeacherProfileInput validates teaching levels", () => {
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ teachingLevels: ["unknown"] })),
    { ok: false, code: "invalidTeachingLevels" },
  );
});

test("validateTeacherProfileInput validates teaching languages", () => {
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ teachingLanguages: ["fr"] })),
    { ok: false, code: "invalidTeachingLanguages" },
  );
});

test("validateTeacherProfileInput validates phone", () => {
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ phone: "hello phone" })),
    { ok: false, code: "invalidPhone" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ phone: "1".repeat(33) })),
    { ok: false, code: "invalidPhone" },
  );
});

test("validateTeacherProfileInput validates lesson price and currency", () => {
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ lessonPrice: "-100" })),
    { ok: false, code: "invalidLessonPrice" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ lessonPrice: "100.123" })),
    { ok: false, code: "invalidLessonPrice" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ lessonPrice: "100001" })),
    { ok: false, code: "invalidLessonPrice" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ lessonCurrency: "GBP" })),
    { ok: false, code: "invalidLessonCurrency" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(
      validInput({
        lessonPrice: "500",
        lessonCurrency: "",
      }),
    ),
    { ok: false, code: "invalidLessonCurrency" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(
      validInput({
        lessonPrice: "",
        lessonCurrency: "UAH",
      }),
    ),
    { ok: false, code: "invalidLessonCurrency" },
  );
});

test("validateTeacherProfileInput validates lesson duration", () => {
  assert.deepEqual(
    validateTeacherProfileInput(validInput({ lessonDurationMinutes: "0" })),
    { ok: false, code: "invalidLessonDuration" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ lessonDurationMinutes: "60.5" })),
    { ok: false, code: "invalidLessonDuration" },
  );

  assert.deepEqual(
    validateTeacherProfileInput(validInput({ lessonDurationMinutes: "301" })),
    { ok: false, code: "invalidLessonDuration" },
  );
});

test("validateTeacherProfileInput allows empty optional draft fields", () => {
  const result = validateTeacherProfileInput(
    validInput({
      headline: "",
      bio: "",
      experience: "",
      publications: "",
      city: "",
      country: "",
      subjects: "",
      teachingLevels: [],
      teachingLanguages: [],
      contactUrl: "",
      phone: "",
      lessonPrice: "",
      lessonCurrency: "",
      lessonDurationMinutes: "",
      joinMotivation: "",
    }),
  );

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.value.headline, "");
    assert.equal(result.value.country, "");
    assert.deepEqual(result.value.subjects, []);
    assert.deepEqual(result.value.teachingLevels, []);
    assert.deepEqual(result.value.teachingLanguages, []);
    assert.equal(result.value.contactUrl, "");
    assert.equal(result.value.phone, "");
    assert.equal(result.value.lessonPrice, null);
    assert.equal(result.value.lessonCurrency, "");
    assert.equal(result.value.lessonDurationMinutes, null);
    assert.equal(result.value.joinMotivation, "");
  }
});

test("validateTeacherProfileSubmission accepts a complete profile", () => {
  const draft = validateTeacherProfileInput(validInput());

  assert.equal(draft.ok, true);

  if (draft.ok) {
    assert.deepEqual(validateTeacherProfileSubmission(draft.value), {
      ok: true,
    });
  }
});

test("validateTeacherProfileSubmission requires submission fields", () => {
  const cases = [
    {
      overrides: { headline: "" },
      code: "headlineRequired",
    },
    {
      overrides: { bio: "" },
      code: "bioRequired",
    },
    {
      overrides: { experience: "" },
      code: "experienceRequired",
    },
    {
      overrides: { country: "" },
      code: "countryRequired",
    },
    {
      overrides: { subjects: "" },
      code: "subjectsRequired",
    },
    {
      overrides: { teachingLevels: [] },
      code: "teachingLevelsRequired",
    },
    {
      overrides: { teachingLanguages: [] },
      code: "teachingLanguagesRequired",
    },
    {
      overrides: { joinMotivation: "" },
      code: "joinMotivationRequired",
    },
  ];

  for (const { overrides, code } of cases) {
    const draft = validateTeacherProfileInput(validInput(overrides));

    assert.equal(draft.ok, true);

    if (draft.ok) {
      assert.deepEqual(validateTeacherProfileSubmission(draft.value), {
        ok: false,
        code,
      });
    }
  }
});

test("validateTeacherProfileSubmission allows optional publication fields to be empty", () => {
  const draft = validateTeacherProfileInput(
    validInput({
      city: "",
      publications: "",
      contactUrl: "",
      phone: "",
      lessonPrice: "",
      lessonCurrency: "",
      lessonDurationMinutes: "",
    }),
  );

  assert.equal(draft.ok, true);

  if (draft.ok) {
    assert.deepEqual(validateTeacherProfileSubmission(draft.value), {
      ok: true,
    });
  }
});
