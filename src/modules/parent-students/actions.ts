"use server";

import type { CreateParentInviteResult } from "./createParentInvite";
import { handleCreateParentInvite } from "./createParentInviteAction";
import { handleParentRegistration, type RegisterParentActionState } from "./registerParentAction";
import { linkParentFromInvite, type LinkParentInviteResult } from "./linkParentFromInvite";
import { unlinkParent, type UnlinkParentResult } from "./unlinkParent";
import { redirect } from "next/navigation";

export type { RegisterParentActionState } from "./registerParentAction";

export type AcceptParentInviteState =
  | { status: "idle" }
  | Extract<LinkParentInviteResult, { status: "error" }>;

/** Only studentId is accepted; authorization and validation stay server-side. */
export async function createParentInviteAction(formData?: FormData): Promise<CreateParentInviteResult> {
  return handleCreateParentInvite(formData);
}

/** Compatible with useActionState; role, student id and dependencies are not accepted. */
export async function registerParentAction(
  _previous: RegisterParentActionState,
  formData: FormData,
): Promise<RegisterParentActionState> {
  return handleParentRegistration(formData);
}

/** Links the signed-in parent. The token is the only client field. */
export async function acceptParentInviteAction(
  _previous: AcceptParentInviteState,
  formData: FormData,
): Promise<AcceptParentInviteState> {
  const token = formData.get("token");
  const result = await linkParentFromInvite(typeof token === "string" ? token : "");
  if (result.status === "error") return result;
  redirect("/parent");
}

/** Student removes one parent. The parent id is which row; the student id stays in the session. */
export async function unlinkParentAction(parentId: number): Promise<UnlinkParentResult> {
  return unlinkParent(parentId);
}
