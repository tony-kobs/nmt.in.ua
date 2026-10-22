"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  createTelegramLinkAction,
  unlinkTelegramAction,
  type TelegramLinkActionState,
  type TelegramUnlinkActionState,
} from "@/modules/telegram/actions";
import css from "./AccountCabinet.module.css";

const initialState: TelegramLinkActionState = { status: "idle" };
const unlinkInitial: TelegramUnlinkActionState = { status: "idle" };

export function TelegramLinkControl({
  linked,
  username = null,
}: {
  linked: boolean;
  username?: string | null;
}) {
  const t = useTranslations("AccountCabinet");
  const [state, action, pending] = useActionState(createTelegramLinkAction, initialState);
  const [unlinkState, unlink, unlinkPending] = useActionState(unlinkTelegramAction, unlinkInitial);
  return (
    <section className={css.panel} aria-labelledby="account-telegram-title">
      <h2 id="account-telegram-title" className={css.panelTitle}>Telegram</h2>
      {linked ? (
        <>
          <p className={css.panelLead}>
            {t("telegramLinked")}
            {username ? <span translate="no">{` @${username}`}</span> : null}
          </p>
          <form
            action={unlink}
            onSubmit={(event) => {
              if (!window.confirm(t("telegramUnlinkConfirm"))) event.preventDefault();
            }}
          >
            <button className={css.joinQuiet} disabled={unlinkPending} type="submit">
              {unlinkPending ? t("telegramUnlinkPending") : t("telegramUnlink")}
            </button>
          </form>
          {unlinkState.status === "error" ? <p role="alert">{t("telegramUnlinkError")}</p> : null}
        </>
      ) : (
        <>
          <form action={action}>
            <button className={css.joinLink} disabled={pending} type="submit">
              {pending ? t("telegramLoading") : t("telegramConnect")}
            </button>
          </form>
          {state.status === "success" ? (
            <a className={css.joinLink} href={state.url} target="_blank" rel="noopener noreferrer">
              {t("telegramOpen")}
            </a>
          ) : null}
          {state.status === "error" ? <p role="alert">{t("telegramError")}</p> : null}
        </>
      )}
    </section>
  );
}
