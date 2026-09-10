export type { AuthUser, SessionPayload, UserRole, StudentOption } from "./types";
export {
  DEMO_ACCOUNTS,
  avatarSrc,
  canAssignMentorSessions,
  canImportContent,
  roleLabel,
  userInitials,
} from "./types";
export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  createSessionToken,
  verifySessionToken,
} from "./sessionToken";
export {
  getCurrentUser,
  getCurrentUserId,
  getSessionPayload,
  requireRole,
  requireUser,
  requireUserId,
  sessionCookieNeedsUpgrade,
} from "./getCurrentUser";
export type {
  LoginActionState,
  RegisterActionState,
  ChangePasswordActionState,
  UploadAvatarActionState,
} from "./actions";
export {
  loginAction,
  registerAction,
  logoutAction,
  demoLoginAction,
  changePasswordAction,
  uploadAvatarAction,
  removeAvatarAction,
} from "./actions";
export {
  ensureAuthSchema,
  findUserById,
  findUserByLogin,
  listStudents,
  createUser,
  CreateUserError,
  updateUserPassword,
} from "./users";
export { changePassword, ChangePasswordError } from "./changePassword";
export type { ChangePasswordErrorCode } from "./changePassword";
export { validateChangePasswordInput } from "./validateChangePassword";
export type {
  ChangePasswordFieldError,
  ChangePasswordInput,
} from "./validateChangePassword";
export type { CreateUserInput } from "./users";
export {
  validateRegistrationInput,
  PASSWORD_MIN_LEN,
  PASSWORD_MAX_LEN,
} from "./validateRegistration";
export type {
  RegistrationFieldError,
  RegistrationInput,
} from "./validateRegistration";
