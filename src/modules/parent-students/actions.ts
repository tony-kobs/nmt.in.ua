"use server";

import { createParentInvite, type CreateParentInviteResult } from "./createParentInvite";
import { handleParentRegistration, type RegisterParentActionState } from "./registerParentAction";

export type { RegisterParentActionState } from "./registerParentAction";

/** No arguments or injectable dependencies exposed to the client. */
export async function createParentInviteAction(): Promise<CreateParentInviteResult> {
  return createParentInvite();
}

/** Compatible with useActionState; role, student id and dependencies are not accepted. */
export async function registerParentAction(
  _previous: RegisterParentActionState,
  formData: FormData,
): Promise<RegisterParentActionState> {
  return handleParentRegistration(formData);
}
