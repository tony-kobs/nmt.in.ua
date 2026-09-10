"use client";

import clsx from "clsx";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createConsultationRequestAction,
  type CreateConsultationActionState,
} from "@/modules/consultations/actions";
import {
  NOTE_MAX_LEN,
  type ConsultationRequestView,
} from "@/modules/consultations/types";
import css from "./ConsultationsStudentPanel.module.css";

const INITIAL: CreateConsultationActionState = { status: "idle" };

type ConsultationsStudentPanelProps = {
  openRequest: ConsultationRequestView | null;
};

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function OpenRequestCard({
  request,
}: {
  request: ConsultationRequestView;
}) {
  const t = useTranslations("Consultations");
  const locale = useLocale();

  return (
    <article className={css.openCard} aria-labelledby="consultation-open-title">
      <p className={clsx(css.badge, css[`badge_${request.status}`])}>
        {t(`statuses.${request.status}`)}
      </p>
      <h2 id="consultation-open-title" className={css.panelTitle}>
        {t(`openTitle.${request.status}`)}
      </h2>
      <p className={css.panelLead}>{t(`openLead.${request.status}`)}</p>
      <p className={css.meta}>
        {t("sentAt", { when: formatWhen(request.createdAt, locale) })}
      </p>
      {request.note ? (
        <p className={css.note}>{request.note}</p>
      ) : (
        <p className={css.noteMuted}>{t("noNote")}</p>
      )}
    </article>
  );
}

export function ConsultationsStudentPanel({
  openRequest,
}: ConsultationsStudentPanelProps) {
  const t = useTranslations("Consultations");
  const [state, formAction, pending] = useActionState(
    createConsultationRequestAction,
    INITIAL,
  );

  const shownRequest =
    openRequest ?? (state.status === "success" ? state.request : null);

  return (
    <div className={css.layout}>
      {shownRequest ? (
        <OpenRequestCard request={shownRequest} />
      ) : (
        <section className={css.panel} aria-labelledby="consultation-form-title">
          <div>
            <h2 id="consultation-form-title" className={css.panelTitle}>
              {t("formTitle")}
            </h2>
            <p className={css.panelLead}>{t("formLead")}</p>
          </div>

          {state.status === "error" ? (
            <p className={clsx(css.alert, css.alertError)} role="alert">
              {t(`errors.${state.code}`)}
            </p>
          ) : null}

          <form className={css.form} action={formAction}>
            <label className={css.field}>
              <span className={css.label}>{t("noteLabel")}</span>
              <textarea
                className={css.textarea}
                name="note"
                rows={4}
                maxLength={NOTE_MAX_LEN}
                disabled={pending}
                placeholder={t("notePlaceholder")}
              />
              <span className={css.hint}>{t("noteHint")}</span>
            </label>
            <button type="submit" className={css.submit} disabled={pending}>
              {pending ? t("submitting") : t("submit")}
            </button>
          </form>
        </section>
      )}

      {state.status === "success" && state.created ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("success")}
        </p>
      ) : null}

      {state.status === "success" && !state.created && !openRequest ? (
        <p className={clsx(css.alert, css.alertHint)} role="status">
          {t("alreadyOpen")}
        </p>
      ) : null}
    </div>
  );
}
