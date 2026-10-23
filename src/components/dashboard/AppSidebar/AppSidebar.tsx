"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { FeedbackEntry } from "@/components/feedback/FeedbackDialog";
import type { CabinetScope, UserRole } from "@/modules/auth/client";
import {
  isMarathonOnlyStudent,
  sidebarLinkActive,
  visibleSidebar,
} from "@/modules/marathons/daily/access";
import { useTranslations } from "next-intl";
import css from "./AppSidebar.module.css";
import { NavIcon, NavSprite } from "./navIcons";

type AppSidebarProps = {
  open: boolean;
  /** Mobile drawer is off-screen: hide from keyboard and AT. Desktop rail stays usable. */
  conceal: boolean;
  onNavigate: () => void;
  role: UserRole;
  cabinetScope?: CabinetScope;
  marathonHref?: string | null;
};

export function AppSidebar({
  open,
  conceal,
  onNavigate,
  role,
  cabinetScope = "full",
  marathonHref = null,
}: AppSidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const marathonOnly = isMarathonOnlyStudent(role, cabinetScope);
  const navItems = visibleSidebar({ role, cabinetScope, marathonHref });

  return (
    <aside
      id="dashboard-sidebar"
      className={clsx(css.sidebar, open ? css.open : css.closed)}
      data-pinned={open ? "true" : undefined}
      aria-label={t("ariaLabel")}
      aria-hidden={conceal}
      inert={conceal}
    >
      <NavSprite />
      <div className={css.scrollInner}>
        <div className={css.top}>
          <p className={css.kicker}>{t("kicker")}</p>
          <p className={css.hint}>{marathonOnly ? t("marathonHint") : t("hint")}</p>
        </div>

        <nav className={css.nav}>
          <ul className={css.list}>
            {navItems.map((item) => {
              const active = sidebarLinkActive(item.href, pathname, role);
              const isSoon = item.status === "soon";

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx(
                      css.link,
                      active && css.active,
                      isSoon && css.linkSoon,
                    )}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    tabIndex={conceal ? -1 : undefined}
                  >
                    <NavIcon name={item.icon} />
                    <span className={css.labelRow}>
                      <span className={css.label}>
                        {item.href === "/" && role === "admin"
                          ? t("nav.homeAdmin")
                          : t(`nav.${item.labelKey}`)}
                      </span>
                      {isSoon ? (
                        <span
                          className={css.soonBadge}
                          aria-label={t("soonLabel")}
                        >
                          {t("soon")}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={css.bottom}>
          {marathonOnly ? null : (
            <div className={css.feedback}>
              <FeedbackEntry
                source="footer"
                isGuest={false}
                variant="sidebar"
                tabIndex={conceal ? -1 : undefined}
              />
            </div>
          )}

          <div className={css.footerCard} aria-hidden>
            <span className={css.footerFormula}>a² + b² = c²</span>
            <span className={css.footerNote}>{t("footer")}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
