"use server";

import type { CreateParentInviteResult } from "./createParentInvite";
import { handleCreateParentInvite } from "./createParentInviteAction";
import { handleParentRegistration, type RegisterParentActionState } from "./registerParentAction";

export type { RegisterParentActionState } from "./registerParentAction";

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
