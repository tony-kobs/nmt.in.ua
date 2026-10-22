import { getTranslations } from "next-intl/server";
import { linkBotAction, setChannelAction } from "@/modules/marathons/daily/actions";
import { unlinkTelegramFormAction } from "@/modules/telegram/actions";
import { ConfirmSubmit } from "./ConfirmSubmit";
import css from "./marathon.module.css";

export async function DeliveryToggles({
  slug,
  prompt,
  emailOn,
  telegramOn,
  telegramLinked,
  telegramUsername,
  botReady,
}: {
  slug: string;
  prompt: string;
  emailOn: boolean;
  telegramOn: boolean;
  telegramLinked: boolean;
  telegramUsername: string | null;
  botReady: boolean;
}) {
  const t = await getTranslations("Marathon");
  return (
    <div className={css.stack}>
      <p className={css.lead}>{prompt}</p>
      {telegramLinked ? (
        <div className={css.linkStatus}>
          <p className={css.badgeOn}>
            {t("botJoined")}
            {telegramUsername ? (
              <span translate="no">{` @${telegramUsername}`}</span>
            ) : null}
          </p>
          <form action={unlinkTelegramFormAction}>
            <input type="hidden" name="slug" value={slug} />
            <ConfirmSubmit
              message={t("unlinkBotConfirm")}
              pendingLabel={t("unlinkBotPending")}
              className={css.buttonQuiet}
            >
              {t("unlinkBot")}
            </ConfirmSubmit>
          </form>
        </div>
      ) : (
        <div className={css.linkStatus}>
          <p className={css.meta}>{t("botNotJoined")}</p>
          {botReady ? (
            <form action={linkBotAction}>
              <input type="hidden" name="slug" value={slug} />
              <button type="submit" className={css.button}>{t("linkBot")}</button>
            </form>
          ) : (
            <p className={css.meta}>{t("botOff")}</p>
          )}
        </div>
      )}
      <form action={setChannelAction} className={css.stack}>
        <input type="hidden" name="slug" value={slug} />
        <div className={css.checks}>
          <label>
            <input type="checkbox" name="notifyEmail" value="1" defaultChecked={emailOn} />
            {t("notifyEmail")}
          </label>
          <label>
            <input type="checkbox" name="notifyTelegram" value="1" defaultChecked={telegramOn} />
            {t("notifyBot")}
          </label>
        </div>
        <button type="submit" className={css.button}>{t("save")}</button>
      </form>
    </div>
  );
}
