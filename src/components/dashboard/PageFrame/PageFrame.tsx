import clsx from "clsx";
import { getTranslations } from "next-intl/server";
import css from "./PageFrame.module.css";

type PageFrameProps = {
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Sentence under the title, without the light chip. */
  plainLead?: boolean;
  kicker?: string;
  children: React.ReactNode;
  className?: string;
};

export function PageFrame({
  title,
  lead,
  plainLead = false,
  kicker,
  children,
  className,
}: PageFrameProps) {
  return (
    <div className={clsx(css.page, className)}>
      <header className={css.intro}>
        {kicker ? <p className={css.kicker}>{kicker}</p> : null}
        <h1 className={css.title}>{title}</h1>
        {lead ? (
          <p className={clsx(css.lead, plainLead && css.leadPlain)}>{lead}</p>
        ) : null}
      </header>
      {children}
    </div>
  );
}

type PageSectionProps = {
  title: string;
  lead?: string;
  children: React.ReactNode;
  id?: string;
};

export function PageSection({ title, lead, children, id }: PageSectionProps) {
  return (
    <section className={css.section} aria-labelledby={id}>
      <div>
        <h2 id={id} className={css.sectionTitle}>
          {title}
        </h2>
        {lead ? <p className={css.sectionLead}>{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function PagePanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx(css.panel, className)}>{children}</div>;
}

export async function SoonCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = await getTranslations("Common");
  return (
    <div className={css.soonCard}>
      <p className={css.soonBadge}>{t("soon")}</p>
      <h3 className={css.soonTitle}>{title}</h3>
      <p className={css.soonText}>{description}</p>
    </div>
  );
}
