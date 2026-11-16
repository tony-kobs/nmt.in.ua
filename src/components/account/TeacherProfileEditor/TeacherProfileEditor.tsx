"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

import {
  saveTeacherProfileAction,
  setTeacherPagePublishedAction,
  submitTeacherProfileForModerationAction,
  type SaveTeacherProfileActionState,
} from "@/modules/teachers/actions";
import {
  TEACHER_PROFILE_BIO_MAX,
  TEACHER_PROFILE_CITY_MAX,
  TEACHER_PROFILE_CONTACT_URL_MAX,
  TEACHER_PROFILE_COUNTRY_MAX,
  TEACHER_PROFILE_EXPERIENCE_MAX,
  TEACHER_PROFILE_HEADLINE_MAX,
  TEACHER_PROFILE_JOIN_MOTIVATION_MAX,
  TEACHER_PROFILE_LESSON_DURATION_MAX,
  TEACHER_PROFILE_LESSON_PRICE_MAX,
  TEACHER_PROFILE_PHONE_MAX,
  TEACHER_PROFILE_PUBLICATIONS_MAX,
  TEACHER_PROFILE_SLUG_MAX,
  TEACHER_PROFILE_SLUG_MIN,
  TEACHER_PROFILE_SUBJECT_MAX,
  TEACHER_PROFILE_SUBJECTS_MAX,
  teacherPublicPath,
  type TeacherProfile,
} from "@/modules/teachers/types";
import { burcobLandingFormUrl } from "@/modules/teachers/landingUrl";
import css from "./TeacherProfileEditor.module.css";
import {
  LESSON_CURRENCIES,
  PHONE_PATTERN,
  SLUG_PATTERN,
  getTeacherProfileDefaultValues,
  teacherProfileToFormData,
  type TeacherProfileFormField,
  type TeacherProfileFormValues,
} from "./teacherProfileForm";
import { TEACHER_PROFILE_ERROR_FIELD } from "./teacherProfileFormErrors";

const INITIAL: SaveTeacherProfileActionState = { status: "idle" };

type TeacherProfileEditorProps = {
  profile: TeacherProfile;
  suggestedSlug: string;
  landingOrderUrl?: string | null;
};

export function TeacherProfileEditor({
  profile,
  suggestedSlug,
  landingOrderUrl = burcobLandingFormUrl(),
}: TeacherProfileEditorProps) {
  const t = useTranslations("TeacherProfile");
  const [state, setState] = useState<SaveTeacherProfileActionState>(INITIAL);
  const [moderationState, setModerationState] = useState<
    Awaited<ReturnType<typeof submitTeacherProfileForModerationAction>>
  >({ status: "idle" });
  const [pending, setPending] = useState(false);
  const [moderationPending, setModerationPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const sharePath = profile.slug ? teacherPublicPath(profile.slug) : "";

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<TeacherProfileFormValues>({
    defaultValues: getTeacherProfileDefaultValues(profile, suggestedSlug),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  function fieldError(message?: string) {
    return message ? (
      <span className={clsx(css.hint, css.fieldError)} role="alert">
        {message}
      </span>
    ) : null;
  }

  function applyServerError(code: string) {
    const field = TEACHER_PROFILE_ERROR_FIELD[code];
    if (!field) return;

    setError(
      field,
      { type: "server", message: t(`errors.${code}`) },
      { shouldFocus: true },
    );
  }

  function validateModerationRequired(
    values: TeacherProfileFormValues,
  ): boolean {
    let valid = true;

    const required: Array<[TeacherProfileFormField, boolean, string]> = [
      ["headline", Boolean(values.headline.trim()), "headlineRequired"],
      ["bio", Boolean(values.bio.trim()), "bioRequired"],
      ["experience", Boolean(values.experience.trim()), "experienceRequired"],
      ["country", Boolean(values.country.trim()), "countryRequired"],
      ["subjects", Boolean(values.subjects.trim()), "subjectsRequired"],
      [
        "teachingLevels",
        values.teachingLevels.length > 0,
        "teachingLevelsRequired",
      ],
      [
        "teachingLanguages",
        values.teachingLanguages.length > 0,
        "teachingLanguagesRequired",
      ],
      [
        "joinMotivation",
        Boolean(values.joinMotivation.trim()),
        "joinMotivationRequired",
      ],
    ];

    for (const [field, condition, code] of required) {
      if (!condition) {
        setError(field, { type: "manual", message: t(`errors.${code}`) });
        valid = false;
      }
    }

    return valid;
  }

  const saveProfile = handleSubmit(async (values) => {
    clearErrors();
    setState(INITIAL);
    setPending(true);

    try {
      const result = await saveTeacherProfileAction(
        INITIAL,
        teacherProfileToFormData(values),
      );
      setState(result);

      if (result.status === "error") {
        applyServerError(result.code);
      }
    } finally {
      setPending(false);
    }
  });

  const submitForModeration = handleSubmit(async (values) => {
    clearErrors();
    setModerationState({ status: "idle" });

    if (!validateModerationRequired(values)) return;

    setModerationPending(true);

    try {
      const result = await submitTeacherProfileForModerationAction(
        { status: "idle" },
        teacherProfileToFormData(values),
      );
      setModerationState(result);

      if (result.status === "error") {
        applyServerError(result.code);
      }
    } finally {
      setModerationPending(false);
    }
  });

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyShareLink() {
    if (!sharePath) return;
    const url = `${window.location.origin}${sharePath}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const disabled = pending || moderationPending;

  return (
    <section className={css.panel} aria-labelledby="teacher-profile-title">
      <div>
        <h2 id="teacher-profile-title" className={css.panelTitle}>
          {t("title")}
        </h2>
        <p className={css.panelLead}>{t("lead")}</p>
        <p className={css.requiredHint}>{t("requiredHint")}</p>
      </div>

      {profile.moderationStatus === "pending" ? (
        <p className={clsx(css.alert, css.alertPending)} role="status">
          {t("moderationPending")}
        </p>
      ) : null}

      {profile.moderationStatus === "rejected" ? (
        <div className={clsx(css.alert, css.alertError)} role="alert">
          <p className={css.statusTitle}>{t("moderationRejected")}</p>
          {profile.rejectionReason ? (
            <p className={css.statusReason}>
              {t("moderationRejectedReason", {
                reason: profile.rejectionReason,
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {profile.moderationStatus === "approved" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("moderationApproved")}
        </p>
      ) : null}

      {state.status === "error" && !TEACHER_PROFILE_ERROR_FIELD[state.code] ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${state.code}`)}
        </p>
      ) : null}

      {state.status === "ok" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("saved")}
        </p>
      ) : null}

      {moderationState.status === "error" &&
      !TEACHER_PROFILE_ERROR_FIELD[moderationState.code] ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${moderationState.code}`)}
        </p>
      ) : null}

      {moderationState.status === "ok" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("submittedForModeration")}
        </p>
      ) : null}

      <form className={css.form} onSubmit={saveProfile} noValidate>
        <label className={css.field}>
          <span className={css.label}>
            {t("slug")} <span className={css.requiredMark}>*</span>
          </span>
          <span className={css.slugRow}>
            <span className={css.slugPrefix} aria-hidden>
              /t/
            </span>
            <input
              className={css.input}
              type="text"
              {...register("slug", {
                required: t("errors.slugRequired"),
                minLength: {
                  value: TEACHER_PROFILE_SLUG_MIN,
                  message: t("errors.invalidSlug"),
                },
                maxLength: {
                  value: TEACHER_PROFILE_SLUG_MAX,
                  message: t("errors.invalidSlug"),
                },
                validate: (value) =>
                  (SLUG_PATTERN.test(value.trim().toLowerCase()) &&
                    !value.includes("--")) ||
                  t("errors.invalidSlug"),
              })}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
            />
          </span>
          <span className={css.hint}>{t("slugHint")}</span>
          {fieldError(errors.slug?.message)}
        </label>

        <label className={css.field}>
          <span className={css.label}>
            {t("headline")}
            <span className={css.requiredMark}>*</span>
          </span>
          <input
            className={css.input}
            type="text"
            {...register("headline", {
              maxLength: {
                value: TEACHER_PROFILE_HEADLINE_MAX,
                message: t("errors.headlineTooLong"),
              },
            })}
            disabled={disabled}
          />
          {fieldError(errors.headline?.message)}
        </label>

        <label className={css.field}>
          <span className={css.label}>
            {t("bio")} <span className={css.requiredMark}>*</span>
          </span>
          <textarea
            className={css.textarea}
            {...register("bio", {
              maxLength: {
                value: TEACHER_PROFILE_BIO_MAX,
                message: t("errors.bioTooLong"),
              },
            })}
            rows={5}
            disabled={disabled}
          />
          {fieldError(errors.bio?.message)}
        </label>

        <label className={css.field}>
          <span className={css.label}>
            {t("experience")}
            <span className={css.requiredMark}>*</span>
          </span>
          <input
            className={css.input}
            type="text"
            {...register("experience", {
              maxLength: {
                value: TEACHER_PROFILE_EXPERIENCE_MAX,
                message: t("errors.experienceTooLong"),
              },
            })}
            disabled={disabled}
          />
          <span className={css.hint}>{t("experienceHint")}</span>
          {fieldError(errors.experience?.message)}
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("publications")}</span>
          <textarea
            className={css.textarea}
            {...register("publications", {
              maxLength: {
                value: TEACHER_PROFILE_PUBLICATIONS_MAX,
                message: t("errors.publicationsTooLong"),
              },
            })}
            rows={3}
            disabled={disabled}
          />
          <span className={css.hint}>{t("publicationsHint")}</span>
          {fieldError(errors.publications?.message)}
        </label>

        <div className={css.pair}>
          <label className={css.field}>
            <span className={css.label}>{t("city")}</span>
            <input
              className={css.input}
              type="text"
              {...register("city", {
                maxLength: {
                  value: TEACHER_PROFILE_CITY_MAX,
                  message: t("errors.cityTooLong"),
                },
              })}
              disabled={disabled}
            />
            {fieldError(errors.city?.message)}
          </label>

          <label className={css.field}>
            <span className={css.label}>
              {t("country")}
              <span className={css.requiredMark}>*</span>
            </span>
            <input
              className={css.input}
              type="text"
              {...register("country", {
                maxLength: {
                  value: TEACHER_PROFILE_COUNTRY_MAX,
                  message: t("errors.countryTooLong"),
                },
              })}
              disabled={disabled}
            />
            {fieldError(errors.country?.message)}
          </label>

          <label className={css.field}>
            <span className={css.label}>
              {t("subjects")}
              <span className={css.requiredMark}>*</span>
            </span>
            <input
              className={css.input}
              type="text"
              {...register("subjects", {
                validate: (value) => {
                  const subjects = value
                    .split(/[,;\n]+/)
                    .map((item) => item.trim())
                    .filter(Boolean);
                  return (
                    (subjects.length <= TEACHER_PROFILE_SUBJECTS_MAX &&
                      subjects.every(
                        (item) => item.length <= TEACHER_PROFILE_SUBJECT_MAX,
                      )) ||
                    t("errors.invalidSubjects")
                  );
                },
              })}
              disabled={disabled}
            />
            <span className={css.hint}>{t("subjectsHint")}</span>
            {fieldError(errors.subjects?.message)}
          </label>
        </div>

        <fieldset className={css.fieldset}>
          <legend className={css.label}>
            {t("levels")}
            <span className={css.requiredMark}>*</span>
          </legend>
          {(["grades_5_9", "grades_10_11", "nmt", "adult"] as const).map(
            (level) => (
              <label className={css.option} key={level}>
                <input
                  type="checkbox"
                  {...register("teachingLevels")}
                  value={level}
                  disabled={disabled}
                />
                <span>{t(`levelsOptions.${level}`)}</span>
              </label>
            ),
          )}
          {fieldError(errors.teachingLevels?.message)}
        </fieldset>

        <fieldset className={css.fieldset}>
          <legend className={css.label}>
            {t("languages")}
            <span className={css.requiredMark}>*</span>
          </legend>
          {(["uk", "en", "de", "pl"] as const).map((language) => (
            <label className={css.option} key={language}>
              <input
                type="checkbox"
                {...register("teachingLanguages")}
                value={language}
                disabled={disabled}
              />
              <span>{t(`languageOptions.${language}`)}</span>
            </label>
          ))}
          {fieldError(errors.teachingLanguages?.message)}
        </fieldset>

        <label className={css.field}>
          <span className={css.label}>{t("contactUrl")}</span>
          <input
            className={css.input}
            type="url"
            {...register("contactUrl", {
              maxLength: {
                value: TEACHER_PROFILE_CONTACT_URL_MAX,
                message: t("errors.invalidContactUrl"),
              },
              validate: (value) => {
                if (!value.trim()) return true;
                try {
                  const url = new URL(value);
                  return (
                    ["http:", "https:"].includes(url.protocol) ||
                    t("errors.invalidContactUrl")
                  );
                } catch {
                  return t("errors.invalidContactUrl");
                }
              },
            })}
            placeholder="https://…"
            disabled={disabled}
          />
          {fieldError(errors.contactUrl?.message)}
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("phone")}</span>
          <input
            className={css.input}
            type="tel"
            {...register("phone", {
              maxLength: {
                value: TEACHER_PROFILE_PHONE_MAX,
                message: t("errors.invalidPhone"),
              },
              validate: (value) =>
                !value.trim() ||
                PHONE_PATTERN.test(value.trim()) ||
                t("errors.invalidPhone"),
            })}
            autoComplete="tel"
            disabled={disabled}
          />
          {fieldError(errors.phone?.message)}
        </label>

        <div className={css.pair}>
          <label className={css.field}>
            <span className={css.label}>{t("lessonPrice")}</span>
            <input
              className={css.input}
              type="number"
              {...register("lessonPrice", {
                validate: (value) => {
                  if (!value.trim()) return true;
                  const parsed = Number(value);
                  return (
                    (Number.isFinite(parsed) &&
                      parsed > 0 &&
                      parsed <= TEACHER_PROFILE_LESSON_PRICE_MAX &&
                      /^\d+(?:\.\d{1,2})?$/.test(value.trim())) ||
                    t("errors.invalidLessonPrice")
                  );
                },
              })}
              min="0"
              step="0.01"
              disabled={disabled}
            />
            {fieldError(errors.lessonPrice?.message)}
          </label>

          <label className={css.field}>
            <span className={css.label}>{t("currency")}</span>
            <select
              className={css.input}
              {...register("lessonCurrency", {
                validate: (currency) => {
                  const price = getValues("lessonPrice").trim();
                  if (!price && !currency) return true;
                  if (price && !currency)
                    return t("errors.invalidLessonCurrency");
                  if (!price && currency)
                    return t("errors.invalidLessonCurrency");
                  return (
                    LESSON_CURRENCIES.includes(
                      currency as (typeof LESSON_CURRENCIES)[number],
                    ) || t("errors.invalidLessonCurrency")
                  );
                },
              })}
              disabled={disabled}
            >
              <option value="">—</option>
              {LESSON_CURRENCIES.map((currency) => (
                <option value={currency} key={currency}>
                  {currency}
                </option>
              ))}
            </select>
            {fieldError(errors.lessonCurrency?.message)}
          </label>
        </div>

        <label className={css.field}>
          <span className={css.label}>{t("lessonDuration")}</span>
          <input
            className={css.input}
            type="number"
            {...register("lessonDurationMinutes", {
              validate: (value) => {
                if (!value.trim()) return true;
                const parsed = Number(value);
                return (
                  (Number.isInteger(parsed) &&
                    parsed > 0 &&
                    parsed <= TEACHER_PROFILE_LESSON_DURATION_MAX) ||
                  t("errors.invalidLessonDuration")
                );
              },
            })}
            min="1"
            disabled={disabled}
          />
          {fieldError(errors.lessonDurationMinutes?.message)}
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("joinMotivation")}</span>
          <textarea
            className={css.textarea}
            {...register("joinMotivation", {
              maxLength: {
                value: TEACHER_PROFILE_JOIN_MOTIVATION_MAX,
                message: t("errors.joinMotivationTooLong"),
              },
            })}
            rows={5}
            disabled={disabled}
          />
          <span className={css.hint}>{t("joinMotivationHint")}</span>
          {fieldError(errors.joinMotivation?.message)}
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("photoUrl")}</span>
          <input className={css.input} {...register("photoUrl")} disabled={disabled} />
          <span className={css.hint}>{t("photoUrlHint")}</span>
          {fieldError(errors.photoUrl?.message)}
        </label>
        <label className={css.field}>
          <span className={css.label}>{t("about")}</span>
          <textarea className={css.textarea} {...register("about")} rows={4} disabled={disabled} />
          {fieldError(errors.about?.message)}
        </label>
        <label className={css.field}>
          <span className={css.label}>{t("approach")}</span>
          <textarea className={css.textarea} {...register("approach")} rows={4} disabled={disabled} />
          {fieldError(errors.approach?.message)}
        </label>
        <label className={css.field}>
          <span className={css.label}>{t("program")}</span>
          <textarea className={css.textarea} {...register("program")} rows={4} disabled={disabled} />
          {fieldError(errors.program?.message)}
        </label>
        <fieldset className={css.field}>
          <legend className={css.label}>{t("reviewTitle")}</legend>
          {([1, 2, 3] as const).map((index) => (
            <div key={index} className={css.field}>
              <label className={css.field}>
                <span className={css.label}>{t("reviewName")}</span>
                <input className={css.input} {...register(`reviewName${index}`)} disabled={disabled} />
              </label>
              <label className={css.field}>
                <span className={css.label}>{t("reviewText")}</span>
                <textarea className={css.textarea} {...register(`reviewText${index}`)} rows={3} disabled={disabled} />
              </label>
            </div>
          ))}
          {fieldError(errors.reviewText1?.message)}
        </fieldset>
        <label className={css.field}>
          <span className={css.label}>{t("externalUrl")}</span>
          <input className={css.input} {...register("externalUrl")} inputMode="url" disabled={disabled} />
          <span className={css.hint}>{t("externalUrlHint")}</span>
          {fieldError(errors.externalUrl?.message)}
        </label>

        <div className={css.actions}>
          <button type="submit" className={css.submit} disabled={disabled}>
            {pending ? t("saving") : t("save")}
          </button>

          {profile.moderationStatus === "draft" ||
          profile.moderationStatus === "rejected" ? (
            <button
              type="button"
              onClick={submitForModeration}
              className={css.share}
              disabled={disabled}
            >
              {t("submitForModeration")}
            </button>
          ) : null}

          <button
            type="button"
            className={css.share}
            onClick={copyShareLink}
            disabled={!profile.slug || disabled}
            aria-live="polite"
          >
            {copied ? t("copied") : t("copyLink")}
          </button>
        </div>
      </form>
      <form action={setTeacherPagePublishedAction}>
        <input type="hidden" name="published" value={profile.isPublic ? "0" : "1"} />
        <button type="submit" className={css.submit}>
          {profile.isPublic ? t("unpublish") : t("publish")}
        </button>
      </form>
      {landingOrderUrl ? (
        <section className={css.panel} aria-labelledby="teacher-landing-order">
          <h3 id="teacher-landing-order" className={css.label}>
            {t("landingOrderTitle")}
          </h3>
          <p className={css.hint}>{t("landingOrderLead")}</p>
          <a className={css.share} href={landingOrderUrl} target="_blank" rel="noopener noreferrer">
            {t("landingOrderCta")}
          </a>
        </section>
      ) : null}
    </section>
  );
}
