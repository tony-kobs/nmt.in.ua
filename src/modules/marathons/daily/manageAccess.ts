import "server-only";

import { getCurrentUser, getSessionPayload, readLiveAccount } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { effectiveRole } from "@/modules/auth/viewRole";

export async function canManageMarathons(): Promise<boolean> {
  const cookieUser = await getCurrentUser();
  const account = cookieUser ? await readLiveAccount(cookieUser.id) : null;
  const payload = cookieUser ? await getSessionPayload() : null;
  const role = account ? effectiveRole(account.role, payload?.viewAs) : null;
  return Boolean(account && !account.isBanned && role && hasPermission(role, "marathon:manage"));
}
