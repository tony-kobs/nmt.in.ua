/**
 * Connection and configuration failures. A missing user or a ban is not one of
 * these: those redirect, and their digest starts with `NEXT_`.
 */
const DATABASE_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "EPIPE",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "POOL_CLOSED",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
]);

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && DATABASE_UNAVAILABLE_CODES.has(code)) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
  return (
    message.includes("Missing required environment variable: DB_") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("EAI_AGAIN") ||
    message.includes("ETIMEDOUT") ||
    message.includes("PROTOCOL_CONNECTION_LOST")
  );
}

/** `redirect()` and `notFound()` must keep propagating. */
export function rethrowNavigation(error: unknown): void {
  if (!error || typeof error !== "object") return;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) {
    throw error;
  }
}
