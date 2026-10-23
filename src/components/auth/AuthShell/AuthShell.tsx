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
  const title = aside?.title ?? t("asideTitle");
  const lead = aside?.lead ?? t("asideLead");

  return (
    <div className={css.page}>
      <SkipLink label={tCommon("skipToContent")} />
      <div className={css.decor} aria-hidden>
        <svg
          className={css.decorMath}
          viewBox="0 0 640 320"
          preserveAspectRatio="xMidYMax slice"
          focusable="false"
        >
          <path className={css.decorAxis} d="M60 20 V 300 M 60 300 H 580" />
          <path className={css.decorCurve} d="M40 260 Q 220 40 400 230 T 610 130" />
          <text className={css.decorGlyph} x="120" y="100">
            ∑
          </text>
          <text className={css.decorGlyph} x="470" y="70">
            π
          </text>
          <text className={css.decorGlyph} x="500" y="255">
            √2
          </text>
          <text className={css.decorFormula} x="145" y="300">
            x² + y² = r²
          </text>
          <text className={css.decorFormula} x="330" y="50">
            sin θ
          </text>
        </svg>
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
            {aside?.badge ? <p className={css.asideBadge}>{aside.badge}</p> : null}
            <p className={css.asideTitle}>{title}</p>
            <p className={css.asideLead}>{lead}</p>
            {aside ? null : (
              <ul className={css.points}>
                <li>{t("asidePoints.a")}</li>
                <li>{t("asidePoints.b")}</li>
                <li>{t("asidePoints.c")}</li>
              </ul>
            )}
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
