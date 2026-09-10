/**
 * Marketing / auth / diagnostic routes that return 200 without a session.
 * Keep in sync with the auth-guard allowlist in `src/proxy.ts`.
 */
export const PUBLIC_PAGE_PATHS = [
  "/",
  "/welcome",
  "/login",
  "/register",
  "/diagnostic",
] as const;
