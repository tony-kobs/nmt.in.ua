"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { isPlatformStaff, type AuthUser } from "@/modules/auth/client";
import { UserAvatar } from "@/components/account/UserAvatar";
import { BrandMark } from "@/components/brand/BrandMark";
import { BrandWord } from "@/components/brand/BrandWord";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { useTranslations } from "next-intl";
import css from "./AppHeader.module.css";

type AppHeaderProps = {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  sidebarMode: "drawer" | "rail";
  user: AuthUser;
};

export function AppHeader({
  onToggleSidebar,
  sidebarOpen,
  sidebarMode,
  user,
}: AppHeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const menuId = useId();
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }
  const viewing =
    user.realRole != null &&
    isPlatformStaff(user.realRole) &&
    user.realRole !== user.role;
  const onAccount = pathname === "/account";
  const roleLabel = viewing
    ? t("viewingAs", { role: t(`roles.${user.role}`) })
    : t(`roles.${user.role}`);
  const toggleLabel = sidebarOpen
    ? t(sidebarMode === "rail" ? "unpinSidebar" : "hideSidebar")
    : t(sidebarMode === "rail" ? "pinSidebar" : "showSidebar");

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      profileButtonRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className={css.header}>
      <div className={css.inner}>
        <button
          type="button"
          id="dashboard-menu-toggle"
          className={css.toggle}
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-controls="dashboard-sidebar"
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <span className={css.toggleGlyph} data-open={sidebarOpen} aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </button>

        <Link
          href="/"
          className={css.brand}
          aria-label={t("siteName")}
          translate="no"
        >
          <span className={css.logo} aria-hidden>
            <BrandMark />
          </span>
          <span className={css.brandCopy}>
            <span className={css.brandText}>
              <BrandWord />
            </span>
            <span className={css.brandSub}>{t("tagline")}</span>
          </span>
        </Link>

        <div className={css.actions}>
          <NotificationBell />
          <div className={css.profileWrap} ref={profileRef}>
            <button
              type="button"
              ref={profileButtonRef}
              className={clsx(css.profile, (menuOpen || onAccount) && css.profileActive)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={t("profileMenu", { name: user.displayName })}
              title={t("profileMenu", { name: user.displayName })}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <UserAvatar user={user} className={css.avatar} />
            </button>
            {menuOpen ? (
              <div id={menuId} className={css.menu} role="group" aria-label={t("profileMenu", { name: user.displayName })}>
                <div className={css.menuIdentity}>
                  <span className={css.menuName}>{user.displayName}</span>
                  <span className={css.menuRole}>{roleLabel}</span>
                </div>
                <Link
                  href="/account"
                  className={clsx(css.menuLink, onAccount && css.menuIdentityActive)}
                  aria-current={onAccount ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {t("account")}
                </Link>
                <Link
                  href="/welcome"
                  className={clsx(css.menuLink, css.aboutLink)}
                  onClick={() => setMenuOpen(false)}
                >
                  {t("goHome")}
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
