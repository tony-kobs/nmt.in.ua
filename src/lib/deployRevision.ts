const SHA = /^[0-9a-f]{40}$/i;
const VERSION = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export type DeployRevision = {
  sha: string | null;
  version: string | null;
};

export function normalizeSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sha = value.trim().toLowerCase();
  return SHA.test(sha) ? sha : null;
}

export function normalizeVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const version = value.trim();
  return VERSION.test(version) ? version : null;
}

/** Vercel env wins. GIT_COMMIT_SHA is the hosting fallback. */
export function revisionFromEnv(env: Record<string, string | undefined>): DeployRevision {
  return {
    sha: normalizeSha(env.VERCEL_GIT_COMMIT_SHA) ?? normalizeSha(env.GIT_COMMIT_SHA),
    version: normalizeVersion(env.NEXT_PUBLIC_APP_VERSION) ?? normalizeVersion(env.APP_VERSION),
  };
}

/**
 * Env overrides the build file. The file is what the hosting artifact carries
 * when Vercel env vars are absent.
 */
export function revisionFromRecord(
  record: unknown,
  env: Record<string, string | undefined>,
): DeployRevision {
  const fromEnv = revisionFromEnv(env);
  const file =
    record && typeof record === "object"
      ? (record as { sha?: unknown; version?: unknown })
      : {};
  return {
    sha: fromEnv.sha ?? normalizeSha(file.sha),
    version: fromEnv.version ?? normalizeVersion(file.version),
  };
}
