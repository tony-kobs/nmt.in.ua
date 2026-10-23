"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { AuthUser, CabinetScope } from "@/modules/auth/client";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { PresenceHeartbeat } from "@/components/dashboard/PresenceHeartbeat";
import { SkipLink } from "@/components/ui/SkipLink";
import { useTranslations } from "next-intl";
import css from "./DashboardShell.module.css";

const STORAGE_KEY = "nmt-sidebar-open";

type DashboardShellProps = {
  children: React.ReactNode;
  user: AuthUser | null;
  cabinetScope?: CabinetScope;
  marathonHref?: string | null;
  footer?: React.ReactNode;
};

const listeners = new Set<() => void>();

function emitSidebarChange() {
  listeners.forEach((listener) => listener());
}

function subscribeSidebar(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeMobile(listener: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

function readMobile() {
  return window.matchMedia("(max-width: 767px)").matches;
}

/** `1` pins the desktop rail open and opens the mobile drawer. */
function readSidebarOpen(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function getServerSidebarOpen() {
  return false;
}

function setSidebarOpen(next: boolean | ((prev: boolean) => boolean)) {
  const value = typeof next === "function" ? next(readSidebarOpen()) : next;
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  emitSidebarChange();
}

export function DashboardShell({
  children,
  user,
  cabinetScope = "full",
  marathonHref = null,
  footer = null,
}: DashboardShellProps) {
  const t = useTranslations("Dashboard");
  const tCommon = useTranslations("Common");

  const pathname = usePathname();

  const sidebarOpen = useSyncExternalStore(
    subscribeSidebar,
    readSidebarOpen,
    getServerSidebarOpen,
  );
  const isMobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const aside = document.getElementById("dashboard-sidebar");
      if (aside?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
      if (sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const html = document.documentElement;
    const { body } = document;

    const unlock = () => {
      html.style.overflow = "";
      body.style.overflow = "";
      body.style.position = "";
      body.style.insetInline = "";
      body.style.top = "";
      body.style.width = "";
      if (body.dataset.sidebarScrollY != null) {
        const y = Number(body.dataset.sidebarScrollY) || 0;
        delete body.dataset.sidebarScrollY;
        window.scrollTo(0, y);
      }
    };

    const sync = () => {
      const shouldLock = sidebarOpen && mq.matches;
      if (!shouldLock) {
        unlock();
        return;
      }
      if (body.dataset.sidebarScrollY == null) {
        const lockedY = window.scrollY;
        body.dataset.sidebarScrollY = String(lockedY);
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.position = "fixed";
        body.style.insetInline = "0";
        body.style.top = `-${lockedY}px`;
        body.style.width = "100%";
      }
    };

    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      unlock();
    };
  }, [sidebarOpen]);

  const isDiagnosticRoute =
    pathname === "/diagnostic" || pathname.startsWith("/diagnostic/");

  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/welcome" ||
    isDiagnosticRoute ||
    !user
  ) {
    return <>{children}</>;
  }

  return (
    <div className={css.shell}>
      <SkipLink label={tCommon("skipToContent")} />
      <PresenceHeartbeat />
      <div className={css.noPrint}>
        <AppHeader
          sidebarOpen={sidebarOpen}
          sidebarMode={isMobile ? "drawer" : "rail"}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          user={user}
        />

        {sidebarOpen ? (
          <button
            type="button"
            className={css.backdrop}
            aria-label={t("hideMenu")}
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
      </div>

      <div className={css.body}>
        <div
          className={clsx(
            css.sidebarSlot,
            css.noPrint,
            sidebarOpen ? css.sidebarSlotOpen : css.sidebarSlotClosed,
          )}
        >
          <AppSidebar
            open={sidebarOpen}
            conceal={isMobile && !sidebarOpen}
            role={user.role}
            cabinetScope={cabinetScope}
            marathonHref={marathonHref}
            onNavigate={() => {
              if (window.matchMedia("(max-width: 767px)").matches) {
                setSidebarOpen(false);
              }
            }}
          />
        </div>

        <div className={css.content}>
          <main id="main-content" className={css.main} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      {footer ? <div className={css.noPrint}>{footer}</div> : null}
    </div>
  );
}
