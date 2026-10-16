"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  saveNotificationPreferencesAction,
  type NotificationPreferencesState,
} from "@/modules/notifications/actions";
import type { UserChannelPreferences } from "@/modules/notifications/channels";
import css from "./AccountCabinet.module.css";

const INITIAL: NotificationPreferencesState = { status: "idle" };

const ROWS = [
  { category: "marathon", email: "marathonEmail", telegram: "marathonTelegram" },
  { category: "news", email: "newsEmail", telegram: "newsTelegram" },
  { category: "system", email: "systemEmail", telegram: "systemTelegram" },
] as const;

export function NotificationSettings({
  preferences,
}: {
  preferences: UserChannelPreferences;
}) {
  const t = useTranslations("AccountCabinet");
  const [state, action, pending] = useActionState(
    saveNotificationPreferencesAction,
    INITIAL,
  );

  return (
    <section className={css.panel} aria-labelledby="account-notifications-title">
      <h2 id="account-notifications-title" className={css.panelTitle}>
        {t("notificationsTitle")}
      </h2>
      <p className={css.panelLead}>{t("notificationsLead")}</p>
      {state.status === "ok" ? (
        <p className={`${css.alert} ${css.alertSuccess}`} role="status">
          {t("notificationsSaved")}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className={`${css.alert} ${css.alertError}`} role="alert">
          {t("notificationsError")}
        </p>
      ) : null}
      <form className={css.form} action={action}>
        {ROWS.map((row) => (
          <fieldset key={row.category} className={css.notifyGroup}>
            <legend className={css.label}>{t(`notifications.${row.category}.title`)}</legend>
            <p className={css.hint}>{t(`notifications.${row.category}.hint`)}</p>
            <div className={css.checks}>
              <label>
                <input
                  type="checkbox"
                  name={row.email}
                  value="1"
                  defaultChecked={preferences[row.category].email}
                  disabled={pending}
                />
                {t("channelEmail")}
              </label>
              <label>
                <input
                  type="checkbox"
                  name={row.telegram}
                  value="1"
                  defaultChecked={preferences[row.category].telegram}
                  disabled={pending}
                />
                {t("channelTelegram")}
              </label>
            </div>
          </fieldset>
        ))}
        <button type="submit" className={css.submit} disabled={pending}>
          {pending ? t("saving") : t("notificationsSave")}
        </button>
      </form>
    </section>
  );
}
