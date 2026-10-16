import { getTranslations } from "next-intl/server";
import {
  declineMarathonAction,
  joinMarathonAction,
} from "@/modules/marathons/daily/actions";
import type { MarathonInvite } from "@/modules/marathons/daily/invite";
import css from "./MarathonHomeCards.module.css";

export async function MarathonInviteBanner({
  invites,
}: {
  invites: MarathonInvite[];
}) {
  if (invites.length === 0) return null;
  const t = await getTranslations("Marathon");
  return (
    <div className={css.stack} role="region" aria-label={t("inviteTitle")}>
      {invites.map((invite) => (
        <article key={invite.id} className={css.banner}>
          <h2 className={css.bannerTitle}>{t("inviteTitle")}</h2>
          <p className={css.bannerText}>{t("inviteBody", { title: invite.title })}</p>
          <div className={css.bannerActions}>
            <form action={joinMarathonAction}>
              <input type="hidden" name="slug" value={invite.slug} />
              <button type="submit" className={css.button}>{t("inviteAccept")}</button>
            </form>
            <form action={declineMarathonAction}>
              <input type="hidden" name="slug" value={invite.slug} />
              <button type="submit" className={css.quiet}>{t("inviteDecline")}</button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
