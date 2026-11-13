"use server";

import { createParentInvite, type CreateParentInviteResult } from "./createParentInvite";

/** No arguments or injectable dependencies exposed to the client. */
export async function createParentInviteAction(): Promise<CreateParentInviteResult> {
  return createParentInvite();
}
