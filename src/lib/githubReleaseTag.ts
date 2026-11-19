import { normalizeSha, normalizeVersion } from "./deployRevision";

export type RemoteTag = { name: string; sha: string };

/** Tags from `GET /repos/{owner}/{repo}/tags`. Annotated tags are already peeled. */
export function tagsFromGithubPayload(payload: unknown): RemoteTag[] {
  if (!Array.isArray(payload)) return [];
  const tags: RemoteTag[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const record = item as { name?: unknown; commit?: { sha?: unknown } };
    const name = normalizeVersion(record.name);
    const sha = normalizeSha(record.commit?.sha);
    if (name && sha) tags.push({ name, sha });
  }
  return tags;
}

/**
 * The build records a version only when a tag already existed. The release
 * tag is created after that build, so a later request can match the published
 * tag to the deployed SHA.
 */
export function versionForDeployedSha(
  tags: readonly RemoteTag[],
  sha: string | null,
  baked: string | null,
): string | null {
  if (baked) return baked;
  if (!sha) return null;
  return tags.find((tag) => tag.sha === sha)?.name ?? null;
}

const NEGATIVE_TTL_MS = 60_000;
const TAGS_URL = "https://api.github.com/repos/tony-kobs/nmt.in.ua/tags?per_page=100";

type Cache = { sha: string; version: string | null; at: number };
let memory: Cache | null = null;

export function resetPublishedVersionCache(): void {
  memory = null;
}

/** One GitHub lookup per SHA. A miss is remembered for a minute, a hit for the process. */
export async function lookupPublishedVersion(
  sha: string,
  options: {
    now?: number;
    ttlMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string | null> {
  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? NEGATIVE_TTL_MS;
  if (memory?.sha === sha) {
    if (memory.version) return memory.version;
    if (now - memory.at < ttl) return null;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(TAGS_URL, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "nmt-in-ua",
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      memory = { sha, version: null, at: now };
      return null;
    }
    const version = versionForDeployedSha(
      tagsFromGithubPayload(await response.json()),
      sha,
      null,
    );
    memory = { sha, version, at: now };
    return version;
  } catch {
    memory = { sha, version: null, at: now };
    return null;
  }
}
