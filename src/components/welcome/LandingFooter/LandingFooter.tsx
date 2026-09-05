import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FeedbackEntry } from "@/components/feedback/FeedbackDialog";
import { SITE_NAME } from "@/constants/seo";
import css from "../landing.module.css";

const FOOTER_LINKS = [
  { key: "features", href: "#features" },
  { key: "steps", href: "#steps" },
  { key: "faq", href: "#faq" },
] as const;

export async function LandingFooter() {
  const t = await getTranslations("WelcomeLanding");
  const nav = await getTranslations("WelcomeLanding.nav");

  return (
    <footer className={css.footer}>
      <div className={css.container}>
        <div className={css.footerInner}>
          <div>
            <p className={css.brand}>
              <span className={css.brandGlyph} aria-hidden>
                ∑
              </span>
              <span className={css.brandName}>{SITE_NAME}</span>
            </p>
            <p className={css.footerTagline}>{t("footer.tagline")}</p>
          </div>

          <nav className={css.footerNav} aria-label={nav("sectionsAria")}>
            {FOOTER_LINKS.map((item) => (
              <a key={item.key} href={item.href} className={css.footerLink}>
                {nav(item.key)}
              </a>
            ))}
            <Link href="/login" className={css.footerLink}>
              {nav("login")}
            </Link>
            <Link href="/register" className={css.footerLink}>
              {nav("register")}
            </Link>
            <FeedbackEntry
              source="footer"
              isGuest
              triggerClassName={css.footerLink}
            />
          </nav>
        </div>

        <div className={css.footerBottom}>
          <p>
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
          <p>{t("footer.rights")}</p>
        </div>
      </div>
    </footer>
  );
}
