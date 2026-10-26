"use client";

import Link from "next/link";
import { guardConfirmedSubmit } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  cancelLearningSessionAction,
  type CancelLearningSessionActionState,
} from "@/modules/sessions/actions";
import type { LearningSessionRow } from "@/modules/sessions/types";
import css from "./LearningSessionsTable.module.css";

const CANCEL_INITIAL: CancelLearningSessionActionState = { status: "idle" };

export function SessionActions({ row }: { row: LearningSessionRow }) {
  const t = useTranslations("LearningSessionsTable");

  const [state, formAction, pending] = useActionState(
    cancelLearningSessionAction,
    CANCEL_INITIAL,
  );

  if (row.status === "completed") {
    return null;
  }

  const waiting = row.status === "planned" && !row.canStart;

  return (
    <div className={css.actions}>
      {row.status === "expired" ? null : waiting ? (
        <span
          className={css.scheduledBadge}
          title={row.availableAtLabel ?? undefined}
        >
          {t("opensAt", { date: row.availableAtLabel ?? "—" })}
        </span>
      ) : (
        <Link href={`/session/${row.id}`} className={css.startLink}>
          {t("start")}
        </Link>
      )}
      <form
        action={formAction}
        className={css.cancelForm}
        onSubmit={(event) => {
          guardConfirmedSubmit(event, t("cancelConfirm", { theme: row.themeName }));
        }}
      >
        <input type="hidden" name="sessionId" value={row.id} />
        <button
          type="submit"
          className={css.cancelButton}
          disabled={pending}
          aria-label={t("cancelSession", { id: row.id })}
        >
          ×
        </button>
      </form>
      {state.status === "error" ? (
        <span className={css.error} role="alert">
          {t(`errors.${state.code}`)}
        </span>
      ) : null}
    </div>
  );
}
