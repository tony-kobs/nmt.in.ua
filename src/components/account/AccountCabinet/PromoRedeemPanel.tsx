"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
import { redeemPromoAction, type RedeemFormState } from "@/modules/promo/actions";
import css from "./AccountCabinet.module.css";

const INITIAL: RedeemFormState = { status: "idle" };

type PromoRedeemPanelProps = {
  accessUntil: string | null;
  teachers: string[];
};

function localeTag(locale: string): string {
  if (locale === "uk") return "uk-UA";
  if (locale === "de") return "de-DE";
  return "en-GB";
}

export function PromoRedeemPanel({ accessUntil, teachers }: PromoRedeemPanelProps) {
  const t = useTranslations("AccountCabinet");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(redeemPromoAction, INITIAL);
  const until = state.status === "ok" ? state.accessUntil : accessUntil;
  const when = until ? formatKyivWhen(new Date(until), localeTag(locale)) : null;
  const linked = state.status === "ok" && state.teacherName
    ? [state.teacherName, ...teachers.filter((name) => name !== state.teacherName)]
    : teachers;

  return (
    <section className={css.panel} aria-labelledby="account-promo-title">
      <h2 id="account-promo-title" className={css.panelTitle}>
        {t("promoTitle")}
      </h2>
      <p className={css.panelLead}>{t("promoLead")}</p>
      {when ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("promoAccessUntil", { date: when })}
        </p>
      ) : (
        <p className={css.panelLead}>{t("promoNoAccess")}</p>
      )}
      {linked.map((name) => (
        <p key={name} className={css.panelLead}>
          {t("promoLinked", { name })}
        </p>
      ))}
      {state.status === "ok" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {state.teacherName
            ? t("promoSavedTeacher", { date: when ?? "", name: state.teacherName })
            : t("promoSaved", { date: when ?? "" })}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`promoErrors.${state.code}`)}
        </p>
      ) : null}
      <form className={css.form} action={formAction}>
        <label className={css.field}>
          <span className={css.label}>{t("promoLabel")}</span>
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
        </label>
        <button className={css.submit} type="submit" disabled={pending}>
          {pending ? t("promoPending") : t("promoSubmit")}
        </button>
      </form>
    </section>
  );
}
