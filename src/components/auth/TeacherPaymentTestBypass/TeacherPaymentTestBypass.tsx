"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  simulateTeacherPaymentSuccessAction,
  type SimulateTeacherPaymentActionState,
} from "@/modules/payments/actions";
import css from "../auth.module.css";

const INITIAL: SimulateTeacherPaymentActionState = { status: "idle" };

type TeacherPaymentTestBypassProps = {
  reference?: string | null;
};

export function TeacherPaymentTestBypass({
  reference,
}: TeacherPaymentTestBypassProps) {
  const t = useTranslations("TeacherRegister.testBypass");
  const [state, formAction, pending] = useActionState(
    simulateTeacherPaymentSuccessAction,
    INITIAL,
  );

  return (
    <form className={css.testBypass} action={formAction}>
      {reference ? (
        <input type="hidden" name="reference" value={reference} />
      ) : null}
      <p className={css.testBypassHint}>{t("hint")}</p>
      <button
        type="submit"
        className={css.testBypassButton}
        disabled={pending}
      >
        {pending ? t("working") : t("payOk")}
      </button>
      {state.status === "error" ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${state.code}`)}
        </p>
      ) : null}
    </form>
  );
}
