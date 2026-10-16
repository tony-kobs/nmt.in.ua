"use client";

import clsx from "clsx";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AuthUser } from "@/modules/auth/client";
import {
  changePasswordAction,
  logoutAction,
  type ChangePasswordActionState,
} from "@/modules/auth/actions";
import { PASSWORD_MAX_LEN, PASSWORD_MIN_LEN } from "@/modules/auth/validateRegistration";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { UserAvatar } from "@/components/account/UserAvatar";
import { TeacherProfileEditor } from "@/components/account/TeacherProfileEditor";
import { AccountPhotoPanel } from "./AccountPhotoPanel";
import { TelegramLinkControl } from "./TelegramLinkControl";
import type { RecentResultItem } from "@/modules/results/getRecentResults";
import type { TeacherProfile } from "@/modules/teachers/types";
import { normalizeSlug } from "@/modules/teachers/validateProfile";
import css from "./AccountCabinet.module.css";

const INITIAL: ChangePasswordActionState = { status: "idle" };

type AccountCabinetProps = {
  user: AuthUser;
  recentResults: RecentResultItem[];
  teacherProfile?: TeacherProfile | null;
  telegramLinked: boolean;
};

export function AccountCabinet({
  user,
  recentResults,
  teacherProfile = null,
  telegramLinked,
}: AccountCabinetProps) {
  const t = useTranslations("AccountCabinet");
  const tHeader = useTranslations("Header");
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    INITIAL,
  );

  return (
    <div className={css.layout}>
      {user.email && !user.emailVerified ? (
        <section className={css.panel} aria-labelledby="account-confirm-email-title">
          <h2 id="account-confirm-email-title" className={css.panelTitle}>
            {t("confirmEmailTitle")}
          </h2>
          <p className={clsx(css.alert, css.alertHint)} role="status">
            {t("confirmEmailLead", { email: user.email })}
          </p>
          <Link
            className={css.joinLink}
            href={`/register/check-email?email=${encodeURIComponent(user.email)}`}
          >
            {t("confirmEmailCta")}
          </Link>
        </section>
      ) : null}

      <section className={css.identity} aria-labelledby="account-identity-title">
        <UserAvatar user={user} className={css.avatar} />
        <div className={css.identityCopy}>
          <h2 id="account-identity-title" className={css.identityName}>
            {user.displayName}
          </h2>
          <p className={css.identityMeta}>
            {tHeader(`roles.${user.role}`)} · @{user.login}
          </p>
        </div>
      </section>

      <AccountPhotoPanel user={user} />
      <TelegramLinkControl linked={telegramLinked} />

      {user.role === "student" ? (
        <section className={css.panel} aria-labelledby="account-join-title">
          <h2 id="account-join-title" className={css.panelTitle}>
            {t("joinInviteTitle")}
          </h2>
          <p className={css.panelLead}>{t("joinInviteLead")}</p>
          <Link className={css.joinLink} href="/join">
            {t("joinInviteCta")}
          </Link>
        </section>
      ) : null}

      {teacherProfile ? (
        <TeacherProfileEditor
          profile={teacherProfile}
          suggestedSlug={normalizeSlug(user.login)}
        />
      ) : null}

      {user.role !== "admin" ? <RecentResults items={recentResults} /> : null}

      <section className={css.panel} aria-labelledby="account-password-title">
        <div>
          <h2 id="account-password-title" className={css.panelTitle}>
            {t("passwordTitle")}
          </h2>
          <p className={css.panelLead}>{t("passwordLead")}</p>
        </div>

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
              disabled={pending}
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
              disabled={pending}
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
              disabled={pending}
            />
          </label>
          <button type="submit" className={css.submit} disabled={pending}>
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
