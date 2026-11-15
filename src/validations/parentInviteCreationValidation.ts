import Joi from "joi";
import { validateSchema } from "./parse";

const id = Joi.alternatives().try(
  Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER).strict(),
  Joi.string().pattern(/^[1-9][0-9]*$/).custom((value: string, helpers) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : helpers.error("any.invalid");
  }),
);

export const parentInviteCreationSchema = Joi.object<{ studentId?: number }>({ studentId: id });

export function validateParentInviteCreation(raw: unknown) {
  return validateSchema(parentInviteCreationSchema, raw);
}
