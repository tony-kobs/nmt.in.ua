"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getSessionPayload,
  readLiveAccount,
  renewSessionCookie,
} from "./getCurrentUser";
import { decideViewRole, viewHomePath } from "./viewRole";

/**
 * Temporary cabinet view for a stored admin or developer.
 * Rewrites the signed cookie only. `app_users.role` stays as it is.
 */
export async function switchRoleAction(formData: FormData): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) redirect("/login");

  const account = await readLiveAccount(payload.userId);
  if (!account || account.isBanned) redirect("/api/auth/clear-session");

  const decision = decideViewRole(account.role, formData.get("role"));
  if (!decision.ok) redirect("/");

  const renewed = await renewSessionCookie(
    { ...account, role: decision.role },
    { viewAs: decision.viewAs },
  );
  if (!renewed) redirect("/login");

  revalidatePath("/", "layout");
  redirect(viewHomePath(decision.role));
}
