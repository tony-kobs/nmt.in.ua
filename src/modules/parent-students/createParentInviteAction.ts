import "server-only";
import { createParentInvite, type CreateParentInviteResult } from "./createParentInvite";
import { validateParentInviteCreation } from "@/validations/parentInviteCreationValidation";

/** Only the target is forwarded; actor/role/teacher fields are never trusted. */
export async function handleCreateParentInvite(
  formData?: FormData,
  create: typeof createParentInvite = createParentInvite,
): Promise<CreateParentInviteResult> {
  if (formData !== undefined && !(formData instanceof FormData)) return { status: "error", code: "forbidden" };
  const studentId = formData?.get("studentId");
  const parsed = validateParentInviteCreation(studentId === null || studentId === undefined ? {} : { studentId });
  if (!parsed.ok) return { status: "error", code: "forbidden" };
  return create(parsed.value);
}
