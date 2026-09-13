import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { ensureAuthSchema } from "@/modules/auth/users";
import type { UserRole } from "@/modules/auth/types";
import { ensureTeacherProfileSchema } from "./schema";
import {
  canEditTeacherProfile,
  emptyTeacherProfile,
  type PublicTeacherCard,
  type TeacherProfile,
} from "./types";
import type { ValidatedTeacherProfile } from "./validateProfile";

type TeacherProfileRow = {
  user_id: number;
  slug: string;
  headline: string | null;
  bio: string | null;
  city: string | null;
  subjects: string | null;
  contact_url: string | null;
  is_public: number | boolean;
};

type PublicTeacherRow = TeacherProfileRow & {
  display_name: string;
  login: string;
  role: UserRole;
  avatar_rev?: number | string | null;
};

type SlugOwnerRow = { user_id: number };

const SQL_GET_OWN = `
  SELECT user_id, slug, headline, bio, city, subjects, contact_url, is_public
  FROM teacher_profiles
  WHERE user_id = ?
  LIMIT 1
`;

const SQL_GET_PUBLIC = `
  SELECT p.user_id, p.slug, p.headline, p.bio, p.city, p.subjects, p.contact_url, p.is_public,
         u.display_name, u.login, u.role,
         UNIX_TIMESTAMP(a.updated_at) AS avatar_rev
  FROM teacher_profiles p
  INNER JOIN app_users u ON u.id = p.user_id
  LEFT JOIN user_avatars a ON a.user_id = u.id
  WHERE p.slug = ?
    AND p.is_public = 1
    AND u.role IN ('teacher', 'admin')
  LIMIT 1
`;

const SQL_SLUG_OWNER = `
  SELECT user_id
  FROM teacher_profiles
  WHERE slug = ?
  LIMIT 1
`;

const SQL_UPSERT = `
  INSERT INTO teacher_profiles
    (user_id, slug, headline, bio, city, subjects, contact_url, is_public)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    slug = VALUES(slug),
    headline = VALUES(headline),
    bio = VALUES(bio),
    city = VALUES(city),
    subjects = VALUES(subjects),
    contact_url = VALUES(contact_url),
    is_public = VALUES(is_public)
`;

export class TeacherProfileError extends Error {
  constructor(readonly code: "slugTaken" | "forbidden" | "serverError") {
    super(code);
    this.name = "TeacherProfileError";
  }
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

type StoreDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function parseSubjectsJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function asPositiveInt(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return numeric;
}

function mapProfile(row: TeacherProfileRow): TeacherProfile {
  return {
    userId: row.user_id,
    slug: row.slug,
    headline: row.headline?.trim() ?? "",
    bio: row.bio?.trim() ?? "",
    city: row.city?.trim() ?? "",
    subjects: parseSubjectsJson(row.subjects),
    contactUrl: row.contact_url?.trim() ?? "",
    isPublic: Boolean(row.is_public),
  };
}

async function withSchema(
  deps: StoreDeps,
): Promise<void> {
  await ensureAuthSchema(deps);
  await ensureTeacherProfileSchema(deps.getConnection);
}

export async function getOwnTeacherProfile(
  userId: number,
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<TeacherProfile> {
  await withSchema(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<TeacherProfileRow>(SQL_GET_OWN, [userId]);
    const row = rows[0];
    return row ? mapProfile(row) : emptyTeacherProfile(userId);
  } finally {
    connection.release();
  }
}

export async function getPublicTeacherCard(
  slug: string,
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<PublicTeacherCard | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  await withSchema(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<PublicTeacherRow>(SQL_GET_PUBLIC, [
      normalized,
    ]);
    const row = rows[0];
    if (!row) return null;
    const card: PublicTeacherCard = {
      ...mapProfile(row),
      displayName: row.display_name.trim(),
      login: row.login,
      role: row.role,
    };
    const avatarRev = asPositiveInt(row.avatar_rev);
    if (avatarRev) card.avatarRev = avatarRev;
    return card;
  } finally {
    connection.release();
  }
}

export async function saveTeacherProfile(
  userId: number,
  role: UserRole,
  value: ValidatedTeacherProfile,
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<TeacherProfile> {
  if (!canEditTeacherProfile(role)) {
    throw new TeacherProfileError("forbidden");
  }

  await withSchema(deps);
  const connection = await deps.getConnection();
  try {
    const owners = await connection.query<SlugOwnerRow>(SQL_SLUG_OWNER, [
      value.slug,
    ]);
    const ownerId = owners[0]?.user_id;
    if (ownerId && ownerId !== userId) {
      throw new TeacherProfileError("slugTaken");
    }

    try {
      await connection.execute(SQL_UPSERT, [
        userId,
        value.slug,
        value.headline || null,
        value.bio || null,
        value.city || null,
        value.subjects.length > 0 ? JSON.stringify(value.subjects) : null,
        value.contactUrl || null,
        value.isPublic ? 1 : 0,
      ]);
    } catch (error) {
      const errno =
        error && typeof error === "object" && "errno" in error
          ? Number((error as { errno?: number }).errno)
          : 0;
      if (errno === 1062) {
        throw new TeacherProfileError("slugTaken");
      }
      throw error;
    }

    return {
      userId,
      slug: value.slug,
      headline: value.headline,
      bio: value.bio,
      city: value.city,
      subjects: value.subjects,
      contactUrl: value.contactUrl,
      isPublic: value.isPublic,
    };
  } finally {
    connection.release();
  }
}
