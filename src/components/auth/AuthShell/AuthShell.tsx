import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SkipLink } from "@/components/ui/SkipLink";
import { BrandMark } from "@/components/brand/BrandMark";
import { BrandWord } from "@/components/brand/BrandWord";
import { SITE_NAME } from "@/constants/seo";
import css from "../auth.module.css";

type AuthShellProps = {
  children: ReactNode;
  aside?: {
    badge: string;
    title: string;
    lead: string;
  };
  /** Extra content under the marketing lead (e.g. register role picker). */
  asideExtra?: ReactNode;
};

/** Shared frame for /login and /register: aurora background, brand, marketing column. */
export async function AuthShell({ children, aside, asideExtra }: AuthShellProps) {
  const t = await getTranslations("AuthShared");
  const tCommon = await getTranslations("Common");
  const badge = aside?.badge ?? t("asideBadge");
  const title = aside?.title ?? t("asideTitle");
  const lead = aside?.lead ?? t("asideLead");

  return (
    <div className={css.page}>
      <SkipLink label={tCommon("skipToContent")} />

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

          <Link href="/" className={css.brand} aria-label={SITE_NAME} translate="no">
            <span className={css.brandGlyph} aria-hidden>
              <BrandMark />
            </span>
            <span className={css.brandName}>
              <BrandWord />
            </span>
          </Link>
        </div>

        <div className={css.layout}>
          <aside className={css.aside}>
            <p className={css.asideBadge}>{badge}</p>
            <p className={css.asideTitle}>{title}</p>
            <p className={css.asideLead}>{lead}</p>
            {asideExtra}
          </aside>

          <main id="main-content" className={css.main} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
