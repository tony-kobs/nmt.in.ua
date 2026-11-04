"use client";

import clsx from "clsx";
import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createConsultationRequestAction,
  type CreateConsultationActionState,
} from "@/modules/consultations/actions";
import {
  NOTE_MAX_LEN,
  type ConsultationRequestView,
} from "@/modules/consultations/types";
import { splitPersonalConsultationNote } from "@/modules/consultations/personalNote";
import type { TeacherCarouselItem } from "@/modules/teachers/types";
import { TeachersCarousel } from "../TeachersCarousel";
import css from "./ConsultationsStudentPanel.module.css";

const INITIAL: CreateConsultationActionState = { status: "idle" };

type ConsultationsStudentPanelProps = {
  openRequest: ConsultationRequestView | null;
  teachers: TeacherCarouselItem[];
};

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function RequestNote({ note }: { note: string }) {
  const t = useTranslations("Consultations");
  const personal = splitPersonalConsultationNote(note);
  if (!personal) return <p className={css.note}>{note}</p>;
  return (
    <div className={css.noteBlock}>
      <p className={css.noteLabel}>
        {t("personalSelected", { name: personal.teacherName })}
      </p>
      {personal.message ? (
        <p className={css.note}>{personal.message}</p>
      ) : (
        <p className={css.noteMuted}>{t("noNote")}</p>
      )}
    </div>
  );
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
        <RequestNote note={request.note} />
      ) : (
        <p className={css.noteMuted}>{t("noNote")}</p>
      )}
    </article>
  );
}

export function ConsultationsStudentPanel({
  openRequest,
  teachers,
}: ConsultationsStudentPanelProps) {
  const t = useTranslations("Consultations");
  const formRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<TeacherCarouselItem | null>(null);
  const [state, formAction, pending] = useActionState(
    createConsultationRequestAction,
    INITIAL,
  );

  const shownRequest =
    openRequest ?? (state.status === "success" ? state.request : null);

  useEffect(() => {
    if (!selected) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  function onSelectPersonal(teacher: TeacherCarouselItem) {
    setSelected(teacher);
  }

  function clearSelected() {
    setSelected(null);
  }

  return (
    <div className={css.layout}>
      <TeachersCarousel
        teachers={teachers}
        selectedTeacherUserId={selected?.userId ?? null}
        onSelectPersonal={onSelectPersonal}
      />

      {shownRequest ? (
        <OpenRequestCard request={shownRequest} />
      ) : (
        <section
          ref={formRef}
          className={css.panel}
          aria-labelledby="consultation-form-title"
        >
          <div>
            <h2 id="consultation-form-title" className={css.panelTitle}>
              {t("formTitle")}
            </h2>
            <p className={css.panelLead}>{t("formLead")}</p>
          </div>

          {selected ? (
            <div className={css.personalChip} role="status">
              <span>
                {t("personalSelected", { name: selected.displayName })}
              </span>
              <button
                type="button"
                className={css.personalClear}
                onClick={clearSelected}
              >
                {t("personalClear")}
              </button>
            </div>
          ) : null}

          {state.status === "error" ? (
            <p className={clsx(css.alert, css.alertError)} role="alert">
              {t(`errors.${state.code}`)}
            </p>
          ) : null}

          <form className={css.form} action={formAction}>
            {selected ? (
              <>
                <input
                  type="hidden"
                  name="personalTeacherName"
                  value={selected.displayName}
                />
                <input
                  type="hidden"
                  name="personalNotePrefix"
                  value={t("personalNotePrefix", { name: selected.displayName })}
                />
              </>
            ) : null}
            <label className={css.field}>
              <span className={css.label}>{t("noteLabel")}</span>
              <textarea
                className={css.textarea}
                name="note"
                rows={4}
                maxLength={NOTE_MAX_LEN}
                disabled={pending}
                placeholder={
                  selected
                    ? t("notePlaceholderPersonal", {
                        name: selected.displayName,
                      })
                    : t("notePlaceholder")
                }
              />
              <span className={css.hint}>{t("noteHint")}</span>
            </label>
            <button type="submit" className={css.submit} disabled={pending}>
              {pending
                ? t("submitting")
                : selected
                  ? t("submitPersonal")
                  : t("submit")}
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
