import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SITE_NAME } from "@/constants/seo";
import css from "../auth.module.css";

type AuthShellProps = {
  children: ReactNode;
  aside?: {
    badge: string;
    title: string;
    lead: string;
  };
};

/** Shared frame for /login and /register: aurora background, brand, marketing column. */
export async function AuthShell({ children, aside }: AuthShellProps) {
  const t = await getTranslations("AuthShared");
  const badge = aside?.badge ?? t("asideBadge");
  const title = aside?.title ?? t("asideTitle");
  const lead = aside?.lead ?? t("asideLead");

  return (
    <div className={css.page}>
      <div className={css.decor} aria-hidden>
        <span className={css.decorGrid} />
        <span className={css.decorOrbA} />
        <span className={css.decorOrbB} />
      </div>

      <div className={css.shell}>
        <div className={css.topbar}>
          <Link href="/" className={css.backLink}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={css.backIcon}
              aria-hidden
            >
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            {t("backHome")}
          </Link>

          <Link href="/" className={css.brand} aria-label={SITE_NAME}>
            <span className={css.brandGlyph} aria-hidden>
              ∑
            </span>
            <span className={css.brandName}>{SITE_NAME}</span>
          </Link>
        </div>

        <div className={css.layout}>
          <aside className={css.aside}>
            <p className={css.asideBadge}>{badge}</p>
            <h2 className={css.asideTitle}>{title}</h2>
            <p className={css.asideLead}>{lead}</p>
          </aside>

          {children}
        </div>
      </div>
    </div>
  );
}
