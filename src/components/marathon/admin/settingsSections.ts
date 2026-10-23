export const SETTINGS_SECTIONS = [
  { id: "basic", fields: ["slug", "title", "subject"] },
  { id: "dates", fields: ["startDate", "unlockHour", "daysCount", "passThreshold"] },
  { id: "landing", fields: ["description", "introVideo", "finalCtaText", "finalCtaUrl", "publicChatUrl", "landingRiddleCount"] },
  { id: "notify", fields: ["inviteAudience"] },
  { id: "telegram", fields: ["reminderHour", "nudgeFrom", "nudgeUntil"] },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

const STORAGE_PREFIX = "nmt.marathonAdmin.sections:";

export function marathonSectionStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

export function sectionFields(id: SettingsSectionId): readonly string[] {
  const found = SETTINGS_SECTIONS.find((section) => section.id === id);
  return found ? found.fields : [];
}

export function invalidSectionIds(issues: Array<{ field: string }>): SettingsSectionId[] {
  const fields = new Set(issues.map((issue) => issue.field));
  return SETTINGS_SECTIONS.filter((section) => section.fields.some((field) => fields.has(field))).map(
    (section) => section.id,
  );
}

export function readSectionOpen(raw: string | null, id: string): boolean | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = (parsed as Record<string, unknown>)[id];
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

export function writeSectionOpen(raw: string | null, id: string, open: boolean): string {
  const map: Record<string, boolean> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === "boolean") map[key] = value;
        }
      }
    } catch {
      // Ignore a broken value and keep the new flag.
    }
  }
  map[id] = open;
  return JSON.stringify(map);
}

export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso.trim();
}

export function joinSummary(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" · ");
}
