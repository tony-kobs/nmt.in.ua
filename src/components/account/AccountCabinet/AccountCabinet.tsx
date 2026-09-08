"use client";

import clsx from "clsx";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AuthUser } from "@/modules/auth/client";
import { userInitials } from "@/modules/auth/client";
import {
  changePasswordAction,
  logoutAction,
  type ChangePasswordActionState,
} from "@/modules/auth/actions";
import { PASSWORD_MAX_LEN, PASSWORD_MIN_LEN } from "@/modules/auth/validateRegistration";
import { RecentResults } from "@/components/dashboard/RecentResults";
import type { RecentResultItem } from "@/modules/results/getRecentResults";
import css from "./AccountCabinet.module.css";

const INITIAL: ChangePasswordActionState = { status: "idle" };

type AccountCabinetProps = {
  user: AuthUser;
  recentResults: RecentResultItem[];
  demoLocked: boolean;
};

export function AccountCabinet({
  user,
  recentResults,
  demoLocked,
}: AccountCabinetProps) {
  const t = useTranslations("AccountCabinet");
  const tHeader = useTranslations("Header");
  const tCommon = useTranslations("Common");
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    INITIAL,
  );

  return (
    <div className={css.layout}>
      <section className={css.identity} aria-labelledby="account-identity-title">
        <span className={css.avatar} aria-hidden>
          {userInitials(user.displayName)}
        </span>
        <div className={css.identityCopy}>
          <h2 id="account-identity-title" className={css.identityName}>
            {user.displayName}
          </h2>
          <p className={css.identityMeta}>
            {tHeader(`roles.${user.role}`)} · @{user.login}
          </p>
        </div>
      </section>

      <RecentResults items={recentResults} />

      <div className={css.stubs}>
        <article className={css.stub} aria-labelledby="account-photo-title">
          <p className={css.soon}>{tCommon("soon")}</p>
          <h2 id="account-photo-title" className={css.stubTitle}>
            {t("photoTitle")}
          </h2>
          <p className={css.stubLead}>{t("photoLead")}</p>
        </article>
        <article className={css.stub} aria-labelledby="account-achievements-title">
          <p className={css.soon}>{tCommon("soon")}</p>
          <h2 id="account-achievements-title" className={css.stubTitle}>
            {t("achievementsTitle")}
          </h2>
          <p className={css.stubLead}>{t("achievementsLead")}</p>
        </article>
        <article className={css.stub} aria-labelledby="account-time-title">
          <p className={css.soon}>{tCommon("soon")}</p>
          <h2 id="account-time-title" className={css.stubTitle}>
            {t("timeTitle")}
          </h2>
          <p className={css.stubLead}>{t("timeLead")}</p>
        </article>
      </div>

      <section className={css.panel} aria-labelledby="account-password-title">
        <div>
          <h2 id="account-password-title" className={css.panelTitle}>
            {t("passwordTitle")}
          </h2>
          <p className={css.panelLead}>{t("passwordLead")}</p>
        </div>

        {demoLocked ? (
          <p className={clsx(css.alert, css.alertHint)} role="status">
            {t("demoLocked")}
          </p>
        ) : null}

        {state.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${state.code}`)}
          </p>
        ) : null}

        {state.status === "ok" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("passwordSaved")}
          </p>
        ) : null}

        <form className={css.form} action={formAction}>
          <label className={css.field}>
            <span className={css.label}>{t("currentPassword")}</span>
            <input
              className={css.input}
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={PASSWORD_MAX_LEN}
              disabled={demoLocked || pending}
            />
          </label>
          <label className={css.field}>
            <span className={css.label}>{t("newPassword")}</span>
            <input
              className={css.input}
              type="password"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LEN}
              maxLength={PASSWORD_MAX_LEN}
              disabled={demoLocked || pending}
            />
            <span className={css.hint}>
              {t("passwordHint", { min: PASSWORD_MIN_LEN })}
            </span>
          </label>
          <label className={css.field}>
            <span className={css.label}>{t("newPasswordConfirm")}</span>
            <input
              className={css.input}
              type="password"
              name="newPasswordConfirm"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LEN}
              maxLength={PASSWORD_MAX_LEN}
              disabled={demoLocked || pending}
            />
          </label>
          <button
            type="submit"
            className={css.submit}
            disabled={demoLocked || pending}
          >
            {pending ? t("saving") : t("savePassword")}
          </button>
        </form>
      </section>

      <section className={css.panel} aria-labelledby="account-logout-title">
        <div>
          <h2 id="account-logout-title" className={css.panelTitle}>
            {t("logoutTitle")}
          </h2>
          <p className={css.panelLead}>{t("logoutLead")}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className={css.logout}>
            {t("logout")}
          </button>
        </form>
      </section>
    </div>
  );
}
