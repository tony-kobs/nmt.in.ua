"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { AuthUser } from "@/modules/auth/client";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { useTranslations } from "next-intl";
import css from "./DashboardShell.module.css";

const STORAGE_KEY = "nmt-sidebar-open";

type DashboardShellProps = {
  children: React.ReactNode;
  user: AuthUser | null;
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
}: DashboardShellProps) {
  const t = useTranslations("Dashboard");

  const pathname = usePathname();

  const isMaterialsPage =
  pathname === "/materials" || pathname.startsWith("/materials/");

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
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    document.body.style.overflow = sidebarOpen && isMobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/welcome" ||
    !user
  ) {
    return <>{children}</>;
  }

  return (
    <div className={css.shell}>
      <div className={css.noPrint}>
        <div className={css.decor} aria-hidden>
          <div className={css.decorGrid} />
          <div className={css.decorOrbA} />
          <div className={css.decorOrbB} />
        </div>

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

      <div className={clsx(css.body, isMaterialsPage && css.materialsBody)}>
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
            onNavigate={() => {
              if (window.matchMedia("(max-width: 767px)").matches) {
                setSidebarOpen(false);
              }
            }}
          />
        </div>

        <div className={css.content}>
          <main className={css.main}>{children}</main>
        </div>
      </div>
    </div>
  );
}
