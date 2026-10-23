import Joi from "joi";

export const LOGIN_MIN_LEN = 3;
export const LOGIN_MAX_LEN = 50;
export const DISPLAY_NAME_MIN_LEN = 2;
export const DISPLAY_NAME_MAX_LEN = 100;
export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 128;
export const EMAIL_MAX_LEN = 255;

/** login: latin letters, digits, underscore, hyphen, dot */
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{1,48}[a-z0-9]$|^[a-z0-9]{3,50}$/i;

/** Practical email check — full RFC is overkill for registration. */
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const passwordSchema = Joi.string()
  .min(PASSWORD_MIN_LEN)
  .max(PASSWORD_MAX_LEN)
  .required();

const loginSchema = Joi.string()
  .trim()
  .lowercase()
  .custom((value: string, helpers) => {
    if (!value) return helpers.error("string.empty");
    if (
      value.length < LOGIN_MIN_LEN ||
      value.length > LOGIN_MAX_LEN ||
      !LOGIN_PATTERN.test(value)
    ) {
      return helpers.error("string.pattern.base");
    }
    if (value.startsWith("demo-")) {
      return helpers.error("login.reserved");
    }
    return value;
  })
  .required();

const displayNameSchema = Joi.string()
  .custom((value: unknown, helpers) => {
    if (typeof value !== "string") return helpers.error("string.base");
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) return helpers.error("string.empty");
    if (normalized.length < DISPLAY_NAME_MIN_LEN) return helpers.error("string.min");
    if (normalized.length > DISPLAY_NAME_MAX_LEN) return helpers.error("string.max");
    return normalized;
  })
  .required();

/** True for a trimmed address our registration schema would accept. */
export function isValidEmailAddress(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return (
    value.length > 0 &&
    value.length <= EMAIL_MAX_LEN &&
    EMAIL_PATTERN.test(value)
  );
}

const emailSchema = Joi.string()
  .trim()
  .lowercase()
  .custom((value: string, helpers) => {
    if (!value) return helpers.error("string.empty");
    if (value.length > EMAIL_MAX_LEN || !EMAIL_PATTERN.test(value)) {
      return helpers.error("string.pattern.base");
    }
    return value;
  })
  .required();

export const registerUserSchema = Joi.object({
  login: loginSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  passwordConfirm: Joi.string().required().valid(Joi.ref("password")),
  email: emailSchema,
});

export const teacherRegisterSchema = Joi.object({
  login: loginSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  passwordConfirm: Joi.string().required().valid(Joi.ref("password")),
});

export const loginUserSchema = Joi.object({
  email: emailSchema,
  password: Joi.string().min(1).max(PASSWORD_MAX_LEN).required(),
});

export const requestResetEmailSchema = Joi.object({
  email: emailSchema,
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().min(1).required(),
  password: passwordSchema,
  passwordConfirm: Joi.string().required().valid(Joi.ref("password")),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).max(PASSWORD_MAX_LEN).required(),
  newPassword: passwordSchema,
  newPasswordConfirm: Joi.string().required().valid(Joi.ref("newPassword")),
}).custom((value, helpers) => {
  if (value.currentPassword === value.newPassword) {
    return helpers.error("password.same");
  }
  return value;
});

export function registrationErrorCode(
  detail: Joi.ValidationErrorItem,
):
  | "requiredFields"
  | "invalidLogin"
  | "invalidDisplayName"
  | "invalidEmail"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "reservedLogin" {
  const key = detail.path[0];
  if (detail.type === "any.required" || detail.type === "string.empty") {
    return "requiredFields";
  }
  if (key === "login") {
    return detail.type === "login.reserved" ? "reservedLogin" : "invalidLogin";
  }
  if (key === "displayName") {
    return detail.type === "string.empty" ? "requiredFields" : "invalidDisplayName";
  }
  if (key === "email") return "invalidEmail";
  if (key === "password") {
    if (detail.type === "string.min") return "passwordTooShort";
    if (detail.type === "string.max") return "passwordTooLong";
    return "requiredFields";
  }
  if (key === "passwordConfirm") {
    return detail.type === "any.only" ? "passwordMismatch" : "requiredFields";
  }
  return "requiredFields";
}

export function changePasswordErrorCode(
  detail: Joi.ValidationErrorItem,
):
  | "requiredFields"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "samePassword" {
  if (detail.type === "password.same") return "samePassword";
  if (detail.type === "any.required" || detail.type === "string.empty") {
    return "requiredFields";
  }
  const key = detail.path[0];
  if (key === "newPassword" && detail.type === "string.min") return "passwordTooShort";
  if (detail.type === "string.max") return "passwordTooLong";
  if (key === "newPasswordConfirm" && detail.type === "any.only") {
    return "passwordMismatch";
  }
  return "requiredFields";
}

export function resetPasswordErrorCode(
  detail: Joi.ValidationErrorItem,
):
  | "invalid_token"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch" {
  const key = detail.path[0];
  if (key === "token") return "invalid_token";
  if (key === "password" && detail.type === "string.min") return "passwordTooShort";
  if (key === "password" && detail.type === "string.max") return "passwordTooLong";
  if (key === "passwordConfirm") return "passwordMismatch";
  return "invalid_token";
}
