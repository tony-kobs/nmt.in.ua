"use client";

import { useActionState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
import {
  createPromoAction,
  setPromoActiveAction,
  type PromoFormState,
} from "@/modules/promo/actions";
import css from "./PromoDesk.module.css";

type PromoCodeCard = {
  id: number;
  code: string;
  teacherName: string | null;
  accessDays: number;
  maxUses: number | null;
  used: number;
  expiresAt: string | null;
  active: boolean;
  redeemers: string[];
};

const INITIAL: PromoFormState = { status: "idle" };

type PromoDeskProps = {
  mode: "staff" | "teacher";
  codes: PromoCodeCard[];
  saved: boolean;
  error: string | null;
  exampleUrl: string | null;
};

function localeTag(locale: string): string {
  if (locale === "uk") return "uk-UA";
  if (locale === "de") return "de-DE";
  return "en-GB";
}

export function PromoDesk({
  mode,
  codes,
  saved,
  error,
  exampleUrl,
}: PromoDeskProps) {
  const t = useTranslations("PromoAdmin");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(createPromoAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state]);

  const formError =
    state.status === "error" && t.has(`errors.${state.code}`)
      ? t(`errors.${state.code}`)
      : null;
  const queryError = error && t.has(`errors.${error}`) ? t(`errors.${error}`) : null;
  const flash = formError ?? queryError;

  return (
    <div className={css.layout}>
      <section className={css.panel} aria-labelledby="promo-create-title">
        <h2 id="promo-create-title" className={css.panelTitle}>
          {t("create")}
        </h2>
        <p className={css.lead}>{mode === "teacher" ? t("leadTeacher") : t("lead")}</p>
        <p className={css.hint}>{t("refHint")}</p>
        {exampleUrl ? <p className={css.hint}>{t("example", { url: exampleUrl })}</p> : null}

        {state.status === "ok" ? (
          <p className={clsx(css.alert, css.alertOk)} role="status">
            {t("created")}
          </p>
        ) : null}
        {saved && state.status !== "ok" ? (
          <p className={clsx(css.alert, css.alertOk)} role="status">
            {t("saved")}
          </p>
        ) : null}
        {flash ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {flash}
          </p>
        ) : null}

        <form ref={formRef} className={css.form} action={formAction}>
          <label className={css.field}>
            <span className={css.label}>{t("code")}</span>
            <input
              className={css.input}
              name="code"
              required
              minLength={4}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
            <span className={css.hint}>{t("codeHint")}</span>
          </label>
          <div className={css.pair}>
            <label className={css.field}>
              <span className={css.label}>{t("days")}</span>
              <input
                className={css.input}
                name="accessDays"
                type="number"
                required
                min={1}
                max={3660}
                defaultValue={14}
                disabled={pending}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t("maxUses")}</span>
              <input
                className={css.input}
                name="maxUses"
                type="number"
                min={1}
                inputMode="numeric"
                disabled={pending}
              />
              <span className={css.hint}>{t("maxUsesHint")}</span>
            </label>
          </div>
          <label className={css.field}>
            <span className={css.label}>{t("expires")}</span>
            <input className={css.input} name="expiresAt" type="datetime-local" disabled={pending} />
          </label>
          {mode === "staff" ? (
            <label className={css.field}>
              <span className={css.label}>{t("teacher")}</span>
              <input
                className={css.input}
                name="teacherRef"
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
              />
              <span className={css.hint}>{t("teacherHint")}</span>
            </label>
          ) : (
            <input type="hidden" name="teacherRef" value="" />
          )}
          <button className={css.submit} type="submit" disabled={pending}>
            {pending ? t("creating") : t("create")}
          </button>
        </form>
      </section>

      <section aria-labelledby="promo-list-title">
        <h2 id="promo-list-title" className={css.panelTitle}>
          {t("title")}
        </h2>
        {codes.length === 0 ? <p className={css.lead}>{t("empty")}</p> : null}
        <ul className={css.list}>
          {codes.map((code) => {
            const when = code.expiresAt
              ? formatKyivWhen(new Date(code.expiresAt), localeTag(locale))
              : null;
            return (
              <li key={code.id} className={css.card}>
                <div className={css.cardTop}>
                  <p className={css.code}>{code.code}</p>
                  <span className={code.active ? css.badgeOn : css.badgeOff}>
                    {code.active ? t("active") : t("inactive")}
                  </span>
                </div>
                <p className={css.meta}>
                  {t("daysLine", { days: code.accessDays })}
                  {" · "}
                  {code.maxUses == null
                    ? t("usesOpen", { used: code.used })
                    : t("usesCapped", { used: code.used, max: code.maxUses })}
                  {" · "}
                  {when ? t("expiresLine", { when }) : t("noExpiry")}
                </p>
                <p className={css.meta}>
                  {code.teacherName
                    ? t("teacherLine", { name: code.teacherName })
                    : t("noTeacher")}
                </p>
                {code.redeemers.length > 0 ? (
                  <p className={css.meta}>{t("redeemers", { names: code.redeemers.join(", ") })}</p>
                ) : null}
                <form action={setPromoActiveAction}>
                  <input type="hidden" name="id" value={code.id} />
                  <input type="hidden" name="active" value={code.active ? "0" : "1"} />
                  <button className={css.quiet} type="submit">
                    {code.active ? t("deactivate") : t("activate")}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
