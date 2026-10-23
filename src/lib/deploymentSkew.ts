/** One automatic reload after a deploy skew. A second failure inside the window shows the error page. */
export const SKEW_RELOAD_KEY = "nmt-skew-reload-at";
export const SKEW_RELOAD_WINDOW_MS = 20_000;

/** Unsubmitted marathon-day radios, restored after that reload. */
export const MARATHON_DRAFT_KEY = "nmt-marathon-day-draft";
export const MARATHON_DAY_FORM_ID = "marathon-day-answers";

const SKEW_TEXT =
  /failed to find server action|was not found on the server|failed-to-find-server-action|older or newer deployment|loading chunk \d+ failed|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load chunk|chunkloaderror/i;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function isDeploymentSkewError(error: unknown): boolean {
  if (typeof error === "string") return SKEW_TEXT.test(error);
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: unknown; message?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  const message = typeof record.message === "string" ? record.message : "";
  if (name === "UnrecognizedActionError" || name === "ChunkLoadError") return true;
  return SKEW_TEXT.test(`${name}\n${message}`);
}

/** Returns true the first time inside the window. The caller then reloads. */
export function claimSkewReload(
  storage: StorageLike,
  now: number,
  windowMs = SKEW_RELOAD_WINDOW_MS,
): boolean {
  const raw = storage.getItem(SKEW_RELOAD_KEY);
  const prev = raw == null || raw === "" ? Number.NaN : Number(raw);
  if (Number.isFinite(prev) && now - prev < windowMs) return false;
  storage.setItem(SKEW_RELOAD_KEY, String(now));
  return true;
}

export type MarathonDraftAnswers = Record<string, string>;

function isTaskField(key: string): boolean {
  return /^task_\d+$/.test(key);
}

function isTaskValue(value: string): boolean {
  return /^[1-9]\d?$/.test(value);
}

export function readMarathonDraft(
  raw: string | null,
  href: string,
): MarathonDraftAnswers | null {
  if (!raw || !href) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { href?: unknown; answers?: unknown };
  if (record.href !== href || !record.answers || typeof record.answers !== "object") {
    return null;
  }
  const answers: MarathonDraftAnswers = {};
  for (const [key, value] of Object.entries(record.answers as Record<string, unknown>)) {
    if (!isTaskField(key) || typeof value !== "string" || !isTaskValue(value)) continue;
    answers[key] = value;
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

export function collectMarathonDraft(
  forms: Iterable<HTMLFormElement>,
  href: string,
): string | null {
  const answers: MarathonDraftAnswers = {};
  for (const form of forms) {
    const data = new FormData(form);
    for (const [key, value] of data.entries()) {
      if (typeof value !== "string" || !isTaskField(key) || !isTaskValue(value)) continue;
      answers[key] = value;
    }
  }
  if (Object.keys(answers).length === 0) return null;
  return JSON.stringify({ href, answers });
}

export function attemptSkewReload(error: unknown, now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  if (!isDeploymentSkewError(error)) return false;
  if (!claimSkewReload(window.sessionStorage, now)) return false;
  const href = `${window.location.pathname}${window.location.search}`;
  const draft = collectMarathonDraft(Array.from(window.document.forms), href);
  if (draft) window.sessionStorage.setItem(MARATHON_DRAFT_KEY, draft);
  window.location.reload();
  return true;
}
