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

function readSidebarOpen(): boolean {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "0") return false;
  if (saved === "1") return true;
  return window.matchMedia("(min-width: 768px)").matches;
}

function getServerSidebarOpen() {
  return true;
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
}: DashboardShellProps) {
  const t = useTranslations("Dashboard");
  const tCommon = useTranslations("Common");

  const pathname = usePathname();

  const isTasksPage =
    pathname === "/tasks" ||
    pathname.startsWith("/tasks/") ||
    (user?.role === "admin" && pathname === "/");

  const sidebarOpen = useSyncExternalStore(
    subscribeSidebar,
    readSidebarOpen,
    getServerSidebarOpen,
  );

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
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

      <div
        className={clsx(
          css.body,
          isTasksPage && css.stableContent,
          sidebarOpen ? css.sidebarOpen : css.sidebarClosed,
        )}
      >
        <div
          className={clsx(
            css.sidebarSlot,
            css.noPrint,
            sidebarOpen ? css.sidebarSlotOpen : css.sidebarSlotClosed,
          )}
        >
          <AppSidebar
            open={sidebarOpen}
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
    </div>
  );
}
