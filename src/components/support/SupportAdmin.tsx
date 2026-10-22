import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame/PageFrame";
import { updateSupportTicketAction } from "@/modules/support/actions";
import type { SupportTicket } from "@/modules/support/store";
import { TICKET_STATUSES, type TicketStatus } from "@/modules/support/text";
import css from "./SupportAdmin.module.css";

const FILTERS = ["all", ...TICKET_STATUSES] as const;

const when = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function filterHref(status: (typeof FILTERS)[number]): string {
  return status === "all" ? "/admin/support" : `/admin/support?status=${status}`;
}

export async function SupportAdmin({
  tickets,
  filter,
  saved,
  error,
}: {
  tickets: SupportTicket[];
  filter: TicketStatus | "all";
  saved: boolean;
  error: string | null;
}) {
  const t = await getTranslations("Support");
  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      {saved ? <p className={css.note} role="status">{t("saved")}</p> : null}
      {error ? (
        <p className={css.alert} role="alert">
          {error === "send_failed" || error === "missing" ? t(`errors.${error}`) : t("errors.invalid")}
        </p>
      ) : null}
      <nav className={css.filters} aria-label={t("filterLabel")}>
        {FILTERS.map((status) => (
          <a
            key={status}
            className={status === filter ? `${css.filter} ${css.filterOn}` : css.filter}
            href={filterHref(status)}
            aria-current={status === filter ? "page" : undefined}
          >
            {t(`filters.${status}`)}
          </a>
        ))}
      </nav>
      <section aria-labelledby="support-list">
        <h2 id="support-list" className={css.listTitle}>{t("listTitle")}</h2>
        {tickets.length === 0 ? <p className={css.empty}>{t("empty")}</p> : (
          <ol className={css.list}>
            {tickets.map((ticket) => (
              <li key={ticket.id} className={css.card}>
                <p className={css.meta}>
                  <span>{when.format(new Date(ticket.createdAt))}</span>
                  <span>{ticket.displayName || ticket.login || t("noName")}</span>
                  {ticket.login ? <span>{ticket.login}</span> : null}
                  <span>{ticket.marathonTitle || t("noMarathon")}</span>
                  {ticket.dayNumber != null ? <span>{t("day", { day: ticket.dayNumber })}</span> : null}
                  <span>{t(`status.${ticket.status}`)}</span>
                </p>
                <p className={css.body}>{ticket.body}</p>
                {ticket.replyText ? <p className={css.replyWas}>{ticket.replyText}</p> : null}
                <form className={css.form} action={updateSupportTicketAction}>
                  <input type="hidden" name="id" value={ticket.id} />
                  <input type="hidden" name="returnStatus" value={filter} />
                  <fieldset className={css.statuses}>
                    <legend className={css.legend}>{t("statusLegend")}</legend>
                    {TICKET_STATUSES.map((status) => (
                      <label key={status} className={css.choice}>
                        <input type="radio" name="status" value={status} defaultChecked={status === ticket.status} />
                        {t(`status.${status}`)}
                      </label>
                    ))}
                  </fieldset>
                  <label className={css.field}>
                    <span>{t("reply")}</span>
                    <textarea className={css.area} name="reply" rows={3} maxLength={4000} placeholder={t("replyPlaceholder")} />
                  </label>
                  <button className={css.submit} type="submit">{t("save")}</button>
                </form>
              </li>
            ))}
          </ol>
        )}
      </section>
    </PageFrame>
  );
}
