"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { canManageProfiles } from "@/modules/auth/types";
import { cancelDeletionByAdmin } from "./accountDeletion";
import { deleteProfile, promotePlatformStudent, setProfileBanned } from "./store";
import { AdminProfilesError } from "./types";

export type ProfileModerationActionState =
  | { status: "idle" }
  | {
      status: "success";
      action: "ban" | "unban" | "delete" | "promote" | "schedule" | "cancelDeletion";
      displayName: string;
      dueAt?: string | null;
      mailWarning?: boolean;
    }
  | { status: "error"; code: ProfileModerationErrorCode };

export type ProfileModerationErrorCode =
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "self_action"
  | "last_admin"
  | "generic";

type ModerationDeps = {
  requireUser: typeof requireUser;
  setProfileBanned: typeof setProfileBanned;
  deleteProfile: typeof deleteProfile;
  promotePlatformStudent: typeof promotePlatformStudent;
  cancelDeletion?: typeof cancelDeletionByAdmin;
  revalidatePath: typeof revalidatePath;
};

function mapError(error: AdminProfilesError): ProfileModerationErrorCode {
  switch (error.code) {
    case "invalid_input":
    case "not_found":
    case "forbidden":
    case "self_action":
    case "last_admin":
      return error.code;
    default:
      return "generic";
  }
}

function parseUserId(raw: unknown): number | null {
  const numeric =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw.trim())
        : NaN;
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

async function requireAdmin(
  deps: Pick<ModerationDeps, "requireUser">,
): Promise<
  | { ok: true; userId: number }
  | { ok: false; state: ProfileModerationActionState }
> {
  const user = await deps.requireUser();
  if (!canManageProfiles(user.role)) {
    return { ok: false, state: { status: "error", code: "forbidden" } };
  }
  return { ok: true, userId: user.id };
}

export async function setProfileBannedAction(
  _prev: ProfileModerationActionState,
  formData: FormData,
  deps: ModerationDeps = {
    requireUser,
    setProfileBanned,
    deleteProfile,
    promotePlatformStudent,
    revalidatePath,
  },
): Promise<ProfileModerationActionState> {
  const auth = await requireAdmin(deps);
  if (!auth.ok) return auth.state;

  const targetUserId = parseUserId(formData.get("userId"));
  const bannedRaw = String(formData.get("banned") ?? "");
  if (!targetUserId || (bannedRaw !== "0" && bannedRaw !== "1")) {
    return { status: "error", code: "invalid_input" };
  }

  try {
    const profile = await deps.setProfileBanned({
      actorUserId: auth.userId,
      targetUserId,
      banned: bannedRaw === "1",
    });
    deps.revalidatePath("/profiles");
    return {
      status: "success",
      action: bannedRaw === "1" ? "ban" : "unban",
      displayName: profile.displayName,
    };
  } catch (error) {
    if (error instanceof AdminProfilesError) {
      return { status: "error", code: mapError(error) };
    }
    console.error("setProfileBannedAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function deleteProfileAction(
  _prev: ProfileModerationActionState,
  formData: FormData,
  deps: ModerationDeps = {
    requireUser,
    setProfileBanned,
    deleteProfile,
    promotePlatformStudent,
    revalidatePath,
  },
): Promise<ProfileModerationActionState> {
  const auth = await requireAdmin(deps);
  if (!auth.ok) return auth.state;

  const targetUserId = parseUserId(formData.get("userId"));
  if (!targetUserId) {
    return { status: "error", code: "invalid_input" };
  }

  try {
    const result = await deps.deleteProfile({
      actorUserId: auth.userId,
      targetUserId,
    });
    deps.revalidatePath("/profiles");
    return {
      status: "success",
      action: result.outcome === "scheduled" ? "schedule" : "delete",
      displayName: result.profile.displayName,
      dueAt: result.dueAt,
      mailWarning: result.mailWarning,
    };
  } catch (error) {
    if (error instanceof AdminProfilesError) {
      return { status: "error", code: mapError(error) };
    }
    console.error("deleteProfileAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function cancelDeletionAction(
  _prev: ProfileModerationActionState,
  formData: FormData,
  deps: ModerationDeps = {
    requireUser,
    setProfileBanned,
    deleteProfile,
    promotePlatformStudent,
    revalidatePath,
  },
): Promise<ProfileModerationActionState> {
  const auth = await requireAdmin(deps);
  if (!auth.ok) return auth.state;
  const targetUserId = parseUserId(formData.get("userId"));
  if (!targetUserId) return { status: "error", code: "invalid_input" };
  if (targetUserId === auth.userId) return { status: "error", code: "self_action" };
  const cancel = deps.cancelDeletion ?? cancelDeletionByAdmin;
  try {
    const cleared = await cancel({
      targetUserId,
      getConnection: async () => {
        const { getConnection } = await import("@/lib/db/mysql");
        return getConnection();
      },
    });
    if (!cleared) return { status: "error", code: "invalid_input" };
    deps.revalidatePath("/profiles");
    return {
      status: "success",
      action: "cancelDeletion",
      displayName: String(formData.get("displayName") ?? ""),
    };
  } catch (error) {
    if (error instanceof AdminProfilesError) {
      return { status: "error", code: mapError(error) };
    }
    console.error("cancelDeletionAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function promotePlatformStudentAction(
  _prev: ProfileModerationActionState,
  formData: FormData,
  deps: ModerationDeps = {
    requireUser,
    setProfileBanned,
    deleteProfile,
    promotePlatformStudent,
    revalidatePath,
  },
): Promise<ProfileModerationActionState> {
  const auth = await requireAdmin(deps);
  if (!auth.ok) return auth.state;

  const targetUserId = parseUserId(formData.get("userId"));
  if (!targetUserId) {
    return { status: "error", code: "invalid_input" };
  }

  try {
    const profile = await deps.promotePlatformStudent({
      actorUserId: auth.userId,
      targetUserId,
    });
    deps.revalidatePath("/profiles");
    return {
      status: "success",
      action: "promote",
      displayName: profile.displayName,
    };
  } catch (error) {
    if (error instanceof AdminProfilesError) {
      return { status: "error", code: mapError(error) };
    }
    console.error("promotePlatformStudentAction failed", error);
    return { status: "error", code: "generic" };
  }
}
