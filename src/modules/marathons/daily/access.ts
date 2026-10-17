import { DASHBOARD_NAV, type NavItemStatus } from "@/constants/navigation";
import { hasPermission } from "@/modules/auth/permissions";
import {
  ADMIN_NAV_HREFS,
  canAssignMentorSessions,
  canImportContent,
  canManageProfiles,
  canManageStudents,
  type CabinetScope,
  type UserRole,
} from "@/modules/auth/types";

export type SidebarLink = {
  href: string;
  labelKey: string;
  status: NavItemStatus;
  icon: string;
};

const ADMIN_NAV_SET = new Set<string>(ADMIN_NAV_HREFS);

const NAV_ICONS: Record<string, string> = {
  "/": "✦",
  "/topic": "∑",
  "/results": "%",
  "/sessions": "⏱",
  "/assign": "✎",
  "/students": "◈",
  "/profiles": "◉",
  "/simulator": "◎",
  "/materials/textbook": "▣",
  "/problems": "ƒ",
  "/feedback": "★",
  "/settings": "⚙",
  "/consultations": "✉",
  "/leaderboard": "▴",
  "/admin/marathons": "5",
};

const NAV_KEYS: Record<string, string> = {
  "/": "home",
  "/topic": "topic",
  "/results": "results",
  "/sessions": "sessions",
  "/assign": "assign",
  "/students": "students",
  "/profiles": "profiles",
  "/simulator": "simulator",
  "/materials/textbook": "materials",
  "/problems": "problems",
  "/feedback": "feedback",
  "/settings": "settings",
  "/consultations": "consultations",
  "/leaderboard": "leaderboard",
  "/admin/marathons": "marathons",
};

const MARATHON_ICON = "◷";

export function isMarathonOnlyStudent(
  role: UserRole,
  scope: CabinetScope | undefined,
): boolean {
  return role === "student" && scope === "marathon";
}

/** Cabinet paths a marathon-only student may open. Profile and their marathon. */
export function marathonOnlyMayOpen(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === "/account" || path.startsWith("/account/")) return true;
  if (path === "/marathon" || path.startsWith("/marathon/")) return true;
  return false;
}

/**
 * Marathon registration now opens the full cabinet, so this redirect is a no-op.
 * The helper stays so older call sites compile. Admin promotion still uses the scope flag.
 */
export function marathonOnlyRedirectTarget(
  _pathname: string,
  _mapPath: string | null,
): string | null {
  return null;
}

export function sidebarLinkActive(
  href: string,
  pathname: string,
  role: UserRole,
): boolean {
  if (href === "/marathon" || href.startsWith("/marathon/")) {
    return pathname === "/marathon" || pathname.startsWith("/marathon/");
  }
  if (href === "/") {
    return pathname === "/" || (role === "admin" && pathname.startsWith("/tasks"));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function marathonLink(href: string): SidebarLink {
  return {
    href,
    labelKey: "marathon",
    status: "ready",
    icon: MARATHON_ICON,
  };
}

/**
 * Sidebar for the signed-in role.
 * Students always get «Марафон» (`/marathon`): the shelf of current courses.
 * A legacy marathon scope no longer hides the rest of the cabinet.
 * Teachers and admins keep their existing menus.
 */
export function visibleSidebar(input: {
  role: UserRole;
  cabinetScope?: CabinetScope;
  marathonHref?: string | null;
}): SidebarLink[] {
  void input.marathonHref;
  void input.cabinetScope;

  const items: SidebarLink[] = DASHBOARD_NAV.filter((item) => {
    if (input.role === "admin") return ADMIN_NAV_SET.has(item.href);
    if (input.role === "teacher" && item.href === "/") return false;
    if (item.href === "/topic") return input.role === "student";
    if (item.href === "/assign") return canAssignMentorSessions(input.role);
    if (item.href === "/settings") return canImportContent(input.role);
    if (item.href === "/feedback") return canImportContent(input.role);
    if (item.href === "/profiles") return canManageProfiles(input.role);
    if (item.href === "/students") return canManageStudents(input.role);
    if (item.href === "/admin/marathons") {
      return hasPermission(input.role, "marathon:manage");
    }
    return true;
  }).map((item) => ({
    href: item.href,
    labelKey: NAV_KEYS[item.href] ?? "home",
    status: item.status,
    icon: NAV_ICONS[item.href] ?? "•",
  }));

  if (input.role === "student") {
    const link = marathonLink("/marathon");
    const at = items.findIndex((item) => item.href === "/consultations");
    if (at >= 0) items.splice(at + 1, 0, link);
    else items.push(link);
  }

  return items;
}
