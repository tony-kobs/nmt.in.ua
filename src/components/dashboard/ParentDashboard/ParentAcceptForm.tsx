"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { acceptParentInviteAction, type AcceptParentInviteState } from "@/modules/parent-students/actions";
import css from "./ParentAcceptForm.module.css";

const INITIAL: AcceptParentInviteState = { status: "idle" };

export function ParentAcceptForm({ token, childName }: { token: string; childName: string }) {
  const t = useTranslations("ParentDashboard");
  const [state, action, pending] = useActionState(acceptParentInviteAction, INITIAL);
  return (
    <form className={css.form} action={action}>
      <input type="hidden" name="token" value={token} />
      <p className={css.child}>{t("acceptChild", { name: childName })}</p>
      {state.status === "error" ? (
        <p className={css.error} role="alert">{t("acceptError")}</p>
      ) : null}
      <button className={css.submit} type="submit" disabled={pending}>
        {pending ? t("acceptPending") : t("acceptSubmit")}
      </button>
    </form>
  );
}
