import Joi from "joi";
import { validateSchema } from "./parse";

// mintAuthTokenRaw(): 32 bytes encoded as unpadded base64url (43 characters).
// The last character has two zero padding bits in the canonical encoding.
export const parentInviteSchema = Joi.object<{ token: string }>({
  token: Joi.string().trim().pattern(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/).required(),
});

export function validateParentInviteToken(rawToken: unknown):
  | { ok: true; token: string }
  | { ok: false } {
  const result = validateSchema(parentInviteSchema, { token: rawToken });
  return result.ok ? { ok: true, token: result.value.token } : { ok: false };
}
