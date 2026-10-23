import { safeInternalPath } from "@/lib/safeInternalPath";

export type UtmParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export function readUtm(raw: Record<string, string | undefined>): UtmParams {
  const result: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = raw[key]?.trim().slice(0, 80);
    if (value) result[key] = value;
  }
  return result;
}

export function utmSourceLabel(params: UtmParams): string | null {
  return params.utm_source ?? null;
}

export function serializeUtm(params: UtmParams): string | null {
  if (Object.keys(params).length === 0) return null;
  const json = JSON.stringify(params);
  return json.length <= 512 ? json : json.slice(0, 512);
}

export function parseUtmSource(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { utm_source?: unknown };
    if (typeof parsed.utm_source === "string" && parsed.utm_source.trim()) {
      return parsed.utm_source.trim();
    }
  } catch {
    return raw.slice(0, 80);
  }
  return null;
}

export function normalizeCtaUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("/")) {
    const path = safeInternalPath(value, "");
    return path.startsWith("/") ? path : null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export { loginCandidatesFromEmail } from "@/modules/auth/loginFromEmail";

export function toCsv(rows: string[][]): string {
  const lines = rows.map((row) =>
    row
      .map((cell) => {
        let value = cell ?? "";
        if (/^[=+\-@]/.test(value)) value = `'${value}`;
        if (/[",\n\r]/.test(value)) {
          return `"${value.replaceAll('"', '""')}"`;
        }
        return value;
      })
      .join(","),
  );
  return `\uFEFF${lines.join("\r\n")}`;
}
