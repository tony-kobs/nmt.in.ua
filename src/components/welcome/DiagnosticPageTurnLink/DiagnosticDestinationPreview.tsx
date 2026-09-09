"use client";

import { useTranslations } from "next-intl";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { DiagnosticInfoPanel } from "@/components/diagnostic/DiagnosticInfoPanel";
import { SelfScorePicker } from "@/components/ui/SelfScorePicker";
import { SITE_NAME } from "@/constants/seo";
import shellCss from "@/components/diagnostic/DiagnosticShell/DiagnosticShell.module.css";
import introCss from "@/components/diagnostic/DiagnosticIntro/DiagnosticIntro.module.css";
import previewCss from "./DiagnosticDestinationPreview.module.css";

const NOOP = () => {};

/**
 * Decorative, non-interactive stand-in for `/diagnostic`'s intro screen,
 * shown underneath the turning homepage sheet in `DiagnosticPageTurnLink`
 * during the page-turn transition. Reuses the real shell/intro CSS modules
 * and a few presentational components (PageFrame, DiagnosticInfoPanel,
 * SelfScorePicker) so it stays visually in sync with the real page without
 * duplicating its copy or markup — but it never renders the real
 * `DiagnosticShell`/`DiagnosticIntro` (both wire up server data or the
 * `startDiagnosticAction` form) so no DB read or diagnostic action ever
 * runs for this preview.
 *
 * Only pulls from the "Diagnostic" namespace, which is already in the
 * client-safe message list (see `src/i18n/clientMessages.ts`) — this
 * component intentionally has no text that would need "AuthShared" (the
 * homepage's client bundle doesn't carry it), so the back-link is icon-only.
 */
export function DiagnosticDestinationPreview() {
  const t = useTranslations("Diagnostic");

  return (
    <div className={shellCss.page}>
      {/* Deliberately skips `shellCss.decorGrid` (mask-image) and the real
          `filter: blur()` orbs — see DiagnosticDestinationPreview.module.css
          for why. */}
      <div className={shellCss.decor} aria-hidden="true">
        <span className={previewCss.orbA} />
        <span className={previewCss.orbB} />
      </div>
      <div className={shellCss.inner}>
        <div className={shellCss.topbar}>
          <span className={shellCss.backLink}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </span>
          <span className={shellCss.brand}>
            <span className={shellCss.brandGlyph} aria-hidden="true">
              ∑
            </span>
            <span className={shellCss.brandName}>{SITE_NAME}</span>
          </span>
        </div>

        <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
          <PagePanel className={previewCss.panelPreview}>
            <div className={introCss.form}>
              <div className={introCss.field}>
                <span className={introCss.label}>{t("selfScoreLabel")}</span>
                <SelfScorePicker
                  value={null}
                  onChange={NOOP}
                  ariaLabel={t("selfScoreAria")}
                  disabled
                />
              </div>
              <button
                type="button"
                className={introCss.start}
                disabled
                tabIndex={-1}
              >
                {t("start")}
              </button>
            </div>
          </PagePanel>

          <DiagnosticInfoPanel />
        </PageFrame>
      </div>
    </div>
  );
}
