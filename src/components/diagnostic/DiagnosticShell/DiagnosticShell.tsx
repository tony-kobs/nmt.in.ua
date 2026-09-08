import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SITE_NAME } from "@/constants/seo";
import css from "./DiagnosticShell.module.css";

type DiagnosticShellProps = {
  children: ReactNode;
  /** Adds the lower-page math watermark (see `.decorMath`). `"intro"` is the
   * original generic-math version on `/diagnostic`; `"geometry"` is the
   * Heron's-formula/triangle version shared by the session and result
   * screens, so all three read as one visual family instead of each having
   * its own decor. Omit for the plain grid+orbs decor with no watermark. */
  mathDecor?: "intro" | "geometry";
};

/**
 * Standalone frame for the whole `/diagnostic*` flow (intro, session,
 * result). Guests reach this before any auth, and `DashboardShell` renders
 * bare `children` with no container/padding for them — the same reason
 * `/login` and `/register` bring their own `AuthShell` instead of depending
 * on the dashboard chrome. A logged-in student gets the same frame too (see
 * `DashboardShell`'s passthrough list): the diagnostic is a focused,
 * single-column flow, not a dashboard page, regardless of who is taking it.
 *
 * Uses `--content-narrow` (46rem), not the wide `--container-max` — the same
 * choice `TopicTestStart` makes for its single-column start screen.
 */
export async function DiagnosticShell({
  children,
  mathDecor,
}: DiagnosticShellProps) {
  const t = await getTranslations("AuthShared");

  return (
    <div className={css.page}>
      <div className={css.decor} aria-hidden>
        <span className={css.decorGrid} />
        <span className={css.decorOrbA} />
        <span className={css.decorOrbB} />
        {mathDecor === "intro" ? (
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
        ) : mathDecor === "geometry" ? (
          <svg
            className={css.decorMath}
            viewBox="0 0 640 320"
            preserveAspectRatio="xMidYMax slice"
            focusable="false"
          >
            <path className={css.decorTriangle} d="M150 270 L320 130 L490 270 Z" />
            <path
              className={css.decorAux}
              d="M320 130 V 270"
              strokeDasharray="4 7"
            />
            <text className={css.decorGlyph} x="110" y="230">
              b
            </text>
            <text className={css.decorGlyph} x="505" y="230">
              a
            </text>
            <text className={css.decorGlyph} x="300" y="110">
              c
            </text>
            <text
              className={css.decorFormula}
              x="320"
              y="70"
              textAnchor="middle"
            >
              p = (a + b + c) / 2
            </text>
            <text
              className={css.decorFormula}
              x="320"
              y="305"
              textAnchor="middle"
            >
              S = √(p(p − a)(p − b)(p − c))
            </text>
          </svg>
        ) : null}
      </div>

      <div className={css.inner}>
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

        {children}
      </div>
    </div>
  );
}
