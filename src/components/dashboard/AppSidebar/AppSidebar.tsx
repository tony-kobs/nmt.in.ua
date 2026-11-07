"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { FeedbackEntry } from "@/components/feedback/FeedbackDialog";
import { UserAvatar } from "@/components/account/UserAvatar";
import { isPlatformStaff, type AuthUser, type CabinetScope, type UserRole } from "@/modules/auth/client";
import { logoutAction } from "@/modules/auth/actions";
import { setLocale } from "@/i18n/actions";
import {
  isMarathonOnlyStudent,
  sidebarLinkActive,
  visibleSidebar,
} from "@/modules/marathons/daily/access";
import css from "./AppSidebar.module.css";
import { NavIcon, NavSprite } from "./navIcons";

const LOCALES = ["uk", "en", "de"] as const;
type Locale = (typeof LOCALES)[number];

function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

type AppSidebarProps = {
  open: boolean;
  /** Mobile drawer is off-screen: hide from keyboard and AT. Desktop rail stays usable. */
  conceal: boolean;
  /** Open mobile drawer is a modal dialog. The desktop rail stays a landmark. */
  modal?: boolean;
  onNavigate: () => void;
  user: AuthUser;
  cabinetScope?: CabinetScope;
  marathonHref?: string | null;
  staffTools?: ReactNode;
};

export function AppSidebar({
  open,
  conceal,
  modal = false,
  onNavigate,
  user,
  cabinetScope = "full",
  marathonHref = null,
  staffTools = null,
}: AppSidebarProps) {
  const t = useTranslations("Sidebar");
  const tHeader = useTranslations("Header");
  const tAccount = useTranslations("AccountCabinet");
  const pathname = usePathname();
  const role: UserRole = user.role;
  const marathonOnly = isMarathonOnlyStudent(role, cabinetScope);
  const navItems = visibleSidebar({ role, cabinetScope, marathonHref });
  const onAccount = pathname === "/account";
  const viewing =
    user.realRole != null &&
    isPlatformStaff(user.realRole) &&
    user.realRole !== user.role;

  return (
    <aside
      id="dashboard-sidebar"
      className={clsx(css.sidebar, open ? css.open : css.closed)}
      data-pinned={open ? "true" : undefined}
      role={modal ? "dialog" : undefined}
      aria-modal={modal ? true : undefined}
      aria-label={t("ariaLabel")}
      aria-hidden={conceal}
      inert={conceal}
      tabIndex={modal ? -1 : undefined}
    >
      <NavSprite />
      <div className={css.scrollInner}>
        {marathonOnly ? (
          <div className={clsx(css.top, css.drawerOnly)}>
            <p className={css.hint}>{t("marathonHint")}</p>
          </div>
        ) : null}

        <section
          className={clsx(css.account, css.drawerOnly)}
          aria-labelledby="sidebar-account-label"
        >
          <p className={css.groupLabel} id="sidebar-account-label">
            {tAccount("kicker")}
          </p>
          <Link
            href="/account"
            className={clsx(css.identity, onAccount && css.identityActive)}
            aria-current={onAccount ? "page" : undefined}
            onClick={onNavigate}
            tabIndex={conceal ? -1 : undefined}
          >
            <UserAvatar user={user} className={css.identityAvatar} />
            <span className={css.identityText}>
              <span className={css.identityName}>{user.displayName}</span>
              <span className={css.identityRole}>
                {viewing
                  ? tHeader("viewingAs", { role: tHeader(`roles.${user.role}`) })
                  : tHeader(`roles.${user.role}`)}
              </span>
            </span>
          </Link>
          {staffTools}
        </section>

        <nav className={css.nav} aria-label={t("kicker")}>
          <p className={clsx(css.groupLabel, css.drawerOnly)} aria-hidden>
            {t("kicker")}
          </p>
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
                        {item.href === "/" && isPlatformStaff(role)
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
          <div className={css.drawerOnly}>
            <DrawerLocale conceal={conceal} />
          </div>

          <Link
            href="/welcome"
            className={clsx(css.menuRow, css.drawerOnly)}
            onClick={onNavigate}
            tabIndex={conceal ? -1 : undefined}
          >
            {tHeader("goHome")}
          </Link>

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

          <form action={logoutAction} className={clsx(css.logoutForm, css.drawerOnly)}>
            <button
              type="submit"
              className={css.logoutButton}
              tabIndex={conceal ? -1 : undefined}
            >
              {tAccount("logout")}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function DrawerLocale({ conceal }: { conceal: boolean }) {
  const t = useTranslations("LanguageSwitcher");
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "uk";
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale || pending) return;
    setPending(true);
    try {
      await setLocale(nextLocale);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={css.locale} role="group" aria-label={t("aria")}>
      <p className={css.groupLabel}>{t("aria")}</p>
      <div className={css.localeRow}>
        {LOCALES.map((item) => (
          <button
            key={item}
            type="button"
            className={css.localeButton}
            aria-pressed={item === locale}
            aria-label={t(`${item}Full`)}
            disabled={pending}
            tabIndex={conceal ? -1 : undefined}
            onClick={() => void changeLocale(item)}
          >
            {t(`${item}Full`)}
          </button>
        ))}
      </div>
    </div>
  );
}
