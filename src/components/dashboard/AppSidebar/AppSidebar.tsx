"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { FeedbackEntry } from "@/components/feedback/FeedbackDialog";
import { DASHBOARD_NAV } from "@/constants/navigation";
import type { UserRole } from "@/modules/auth/client";
import { canImportContent, canManageStudents } from "@/modules/auth/client";
import { useTranslations } from "next-intl";
import css from "./AppSidebar.module.css";

type AppSidebarProps = {
  open: boolean;
  onNavigate: () => void;
  role: UserRole;
};

const NAV_ICONS: Record<string, string> = {
  "/": "∑",
  "/results": "%",
  "/sessions": "⏱",
  "/students": "◈",
  "/simulator": "◎",
  "/materials/textbook": "▣",
  "/problems": "ƒ",
  "/settings": "⚙",
  "/consultations": "✉",
};

const NAV_KEYS: Record<string, string> = {
  "/": "home",
  "/results": "results",
  "/sessions": "sessions",
  "/students": "students",
  "/simulator": "simulator",
  "/materials/textbook": "materials",
  "/problems": "problems",
  "/settings": "settings",
  "/consultations": "consultations",
};

export function AppSidebar({ open, onNavigate, role }: AppSidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const navItems = DASHBOARD_NAV.filter((item) => {
    if (item.href === "/settings") return canImportContent(role);
    if (item.href === "/students") return canManageStudents(role);
    return true;
  });

  return (
    <aside
      id="dashboard-sidebar"
      className={clsx(css.sidebar, open ? css.open : css.closed)}
      aria-label={t("ariaLabel")}
      aria-hidden={!open}
      inert={!open}
    >
      <div className={css.scrollInner}>
        <div className={css.top}>
          <p className={css.kicker}>{t("kicker")}</p>
          <p className={css.hint}>{t("hint")}</p>
        </div>

        <nav className={css.nav}>
          <ul className={css.list}>
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
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
                    tabIndex={open ? undefined : -1}
                  >
                    <span className={css.icon} aria-hidden>
                      {NAV_ICONS[item.href] ?? "•"}
                    </span>
                    <span className={css.labelRow}>
                      <span className={css.label}>
                        {t(`nav.${NAV_KEYS[item.href]}`)}
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
          <FeedbackEntry
            source="footer"
            isGuest={false}
            variant="sidebar"
            tabIndex={open ? undefined : -1}
          />

          <div className={css.footerCard} aria-hidden>
            <span className={css.footerFormula}>a² + b² = c²</span>
            <span className={css.footerNote}>{t("footer")}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
