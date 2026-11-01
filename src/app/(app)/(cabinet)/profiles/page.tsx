import { getTranslations } from "next-intl/server";
import { AdminEntryPoints } from "@/components/admin/AdminEntryPoints";
import { AdminProfilesPanel } from "@/components/admin/AdminProfilesPanel";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { USER_ROLES, type UserRole } from "@/modules/auth/types";
import {
  ADMIN_PROFILES_PAGE_SIZE,
  getAdminProfiles,
  type AdminProfilesPage,
} from "@/modules/admin-profiles";
import { getPendingTeacherApplications } from "@/modules/teacher-moderation/store";
import type { TeacherModerationApplication } from "@/modules/teacher-moderation/types";
import { TeacherModerationPanel } from "@/components/admin/TeacherModerationPanel/TeacherModerationPanel";
import { readSearchParam } from "@/lib/queryHref";
import {
  listRecentLoginEntries,
  type LoginEntry,
} from "@/modules/auth/userSessions";

const item = getNavItem("/profiles");

export async function generateMetadata() {
  const t = await getTranslations("Metadata.profiles");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: item.href,
  });
}

type ProfilesPageProps = {
  searchParams: Promise<{
    role?: string | string[];
    page?: string | string[];
  }>;
};

function parseRoleFilter(raw: string | undefined): "all" | UserRole {
  if (raw && (USER_ROLES as readonly string[]).includes(raw)) {
    return raw as UserRole;
  }
  return "all";
}

function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

const EMPTY_PAGE: AdminProfilesPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: ADMIN_PROFILES_PAGE_SIZE,
  totalPages: 1,
  roleCounts: { all: 0, student: 0, teacher: 0, admin: 0 },
};

export default async function ProfilesPage({
  searchParams,
}: ProfilesPageProps) {
  const user = await requireRole(["admin"]);
  const t = await getTranslations("AdminProfiles");
  const params = await searchParams;
  const roleFilter = parseRoleFilter(readSearchParam(params.role));
  const page = parsePage(readSearchParam(params.page));

  let profilesPage: AdminProfilesPage = EMPTY_PAGE;
  let teacherApplications: TeacherModerationApplication[] = [];
  let loginEntries: LoginEntry[] = [];
  try {
    profilesPage = await getAdminProfiles({ page, role: roleFilter });
  } catch (error) {
    console.error("profiles: getAdminProfiles failed", error);
  }
  try {
    teacherApplications = await getPendingTeacherApplications();
  } catch (error) {
    console.error("profiles: getPendingTeacherApplications failed", error);
  }
  try {
    loginEntries = await listRecentLoginEntries();
  } catch (error) {
    console.error("profiles: listRecentLoginEntries failed", error);
  }

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <TeacherModerationPanel applications={teacherApplications} />

      <AdminProfilesPanel
        profilesPage={profilesPage}
        currentUserId={user.id}
        roleFilter={roleFilter}
      />
      <AdminEntryPoints entries={loginEntries} />
    </PageFrame>
  );
}
