"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { AuthUser } from "@/modules/auth/client";
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
  const onAccount = pathname === "/account";
  const toggleLabel = sidebarOpen
    ? t(sidebarMode === "rail" ? "unpinSidebar" : "hideSidebar")
    : t(sidebarMode === "rail" ? "pinSidebar" : "showSidebar");

  return (
    <header className={css.header}>
      <div className={css.inner}>
        <button
          type="button"
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
          <Link href="/welcome" className={css.homeLink}>
            <span className={css.homeLinkShort}>{t("goHomeShort")}</span>
            <span className={css.homeLinkFull}>{t("goHome")}</span>
          </Link>
          <Link
            href="/account"
            className={clsx(css.profile, onAccount && css.profileActive)}
            aria-current={onAccount ? "page" : undefined}
            aria-label={t("openAccount", { name: user.displayName })}
            title={t("openAccount", { name: user.displayName })}
          >
            <UserAvatar user={user} className={css.avatar} />
            <span className={css.profileMeta}>
              <span className={css.profileName}>{user.displayName}</span>
              <span className={css.profileRole}>
                {t(`roles.${user.role}`)}
              </span>
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
