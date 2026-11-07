"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { isPlatformStaff, type AuthUser, type CabinetScope } from "@/modules/auth/client";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { RoleSwitch } from "@/components/dashboard/RoleSwitch";
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
  const pathnameRef = useRef(pathname);

  const sidebarOpen = useSyncExternalStore(
    subscribeSidebar,
    readSidebarOpen,
    getServerSidebarOpen,
  );
  const isMobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);

  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    if (window.matchMedia("(max-width: 767px)").matches && readSidebarOpen()) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const aside = document.getElementById("dashboard-sidebar");
    const toggle = document.getElementById("dashboard-menu-toggle");
    if (isMobile) {
      aside?.focus();
      const current = aside?.querySelector<HTMLElement>("[aria-current='page']");
      current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    const focusable =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        if (isMobile) toggle?.focus();
        return;
      }
      if (!isMobile || event.key !== "Tab" || !aside) return;
      if (document.querySelector("[role='dialog']:not(#dashboard-sidebar)")) return;
      const nodes = [...aside.querySelectorAll<HTMLElement>(focusable)].filter(
        (node) => node.getClientRects().length > 0,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === aside || !aside.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!isMobile) return;
      if (aside?.contains(document.activeElement) || document.activeElement === aside) {
        toggle?.focus();
      }
    };
  }, [sidebarOpen, isMobile]);

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
            modal={isMobile && sidebarOpen}
            user={user}
            cabinetScope={cabinetScope}
            marathonHref={marathonHref}
            staffTools={
              user.realRole && isPlatformStaff(user.realRole) ? (
                <RoleSwitch
                  realRole={user.realRole}
                  effectiveRole={user.role}
                  variant="drawer"
                />
              ) : null
            }
            onNavigate={() => {
              if (window.matchMedia("(max-width: 767px)").matches) {
                setSidebarOpen(false);
              }
            }}
          />
        </div>

        <div className={css.content}>
          <main id="main-content" className={css.main} tabIndex={-1}>
            {user.realRole && isPlatformStaff(user.realRole) ? (
              <RoleSwitch
                realRole={user.realRole}
                effectiveRole={user.role}
                variant="content"
              />
            ) : null}
            {children}
          </main>
        </div>
      </div>
      {footer ? <div className={css.noPrint}>{footer}</div> : null}
    </div>
  );
}
