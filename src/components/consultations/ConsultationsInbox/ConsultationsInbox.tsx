"use client";

import clsx from "clsx";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  updateConsultationRequestStatusAction,
  type UpdateConsultationActionState,
} from "@/modules/consultations/actions";
import {
  isOpenConsultationStatus,
  type ConsultationRequestView,
  type ConsultationStatus,
} from "@/modules/consultations/types";
import css from "./ConsultationsInbox.module.css";

const INITIAL: UpdateConsultationActionState = { status: "idle" };

type ConsultationsInboxProps = {
  rows: ConsultationRequestView[];
};

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function RequestActions({ row }: { row: ConsultationRequestView }) {
  const t = useTranslations("Consultations");
  const [state, formAction, pending] = useActionState(
    updateConsultationRequestStatusAction,
    INITIAL,
  );

  if (!isOpenConsultationStatus(row.status)) {
    return <span className={css.done}>{t("alreadyClosed")}</span>;
  }

  return (
    <div className={css.actions}>
      {row.status === "pending" ? (
        <StatusButton
          requestId={row.id}
          status="acknowledged"
          label={t("acknowledge")}
          pendingLabel={t("saving")}
          pending={pending}
          formAction={formAction}
          tone="secondary"
        />
      ) : null}
      <StatusButton
        requestId={row.id}
        status="closed"
        label={t("close")}
        pendingLabel={t("saving")}
        pending={pending}
        formAction={formAction}
        tone="primary"
      />
      {state.status === "error" ? (
        <span className={css.error} role="alert">
          {t(`errors.${state.code}`)}
        </span>
      ) : null}
    </div>
  );
}

function StatusButton({
  requestId,
  status,
  label,
  pendingLabel,
  pending,
  formAction,
  tone,
}: {
  requestId: number;
  status: ConsultationStatus;
  label: string;
  pendingLabel: string;
  pending: boolean;
  formAction: (payload: FormData) => void;
  tone: "primary" | "secondary";
}) {
  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={tone === "primary" ? css.close : css.acknowledge}
        disabled={pending}
      >
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

function RequestFields({
  row,
  locale,
}: {
  row: ConsultationRequestView;
  locale: string;
}) {
  const t = useTranslations("Consultations");

  return (
    <>
      <p className={css.student}>
        {row.studentDisplayName}
        <span className={css.login}> @{row.studentLogin}</span>
      </p>
      <p className={clsx(css.badge, css[`badge_${row.status}`])}>
        {t(`statuses.${row.status}`)}
      </p>
      <p className={css.when}>{formatWhen(row.createdAt, locale)}</p>
      <p className={row.note ? css.note : css.noteMuted}>
        {row.note ?? t("noNote")}
      </p>
    </>
  );
}

export function ConsultationsInbox({ rows }: ConsultationsInboxProps) {
  const t = useTranslations("Consultations");
  const locale = useLocale();

  return (
    <section className={css.inbox} aria-labelledby="consultations-inbox-title">
      <div>
        <h2 id="consultations-inbox-title" className={css.title}>
          {t("inboxTitle")}
        </h2>
        <p className={css.lead}>{t("inboxLead")}</p>
      </div>

      {rows.length === 0 ? (
        <p className={css.empty} role="status">
          {t("empty")}
        </p>
      ) : (
        <>
          <ul className={css.cards}>
            {rows.map((row) => (
              <li key={row.id} className={css.card}>
                <RequestFields row={row} locale={locale} />
                <RequestActions row={row} />
              </li>
            ))}
          </ul>

          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col">{t("student")}</th>
                  <th scope="col">{t("note")}</th>
                  <th scope="col">{t("status")}</th>
                  <th scope="col">{t("created")}</th>
                  <th scope="col">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.studentDisplayName}
                      <span className={css.login}> @{row.studentLogin}</span>
                    </td>
                    <td className={css.noteCell}>{row.note ?? t("noNote")}</td>
                    <td>
                      <span
                        className={clsx(css.badge, css[`badge_${row.status}`])}
                      >
                        {t(`statuses.${row.status}`)}
                      </span>
                    </td>
                    <td>{formatWhen(row.createdAt, locale)}</td>
                    <td>
                      <RequestActions row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
