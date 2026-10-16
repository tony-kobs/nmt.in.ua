import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";
import type { AuthUser, CabinetScope, UserRole, StudentOption } from "./types";
import { SQL_CREATE_USER_AVATARS } from "./avatar/schema";
import { hashPassword } from "./password";

const AUTH_USERS_TABLE = "app_users";

const SQL_CREATE_USERS = `
  CREATE TABLE IF NOT EXISTS ${AUTH_USERS_TABLE} (
    id INT NOT NULL AUTO_INCREMENT,
    login VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NULL,
    email_verified_at TIMESTAMP NULL DEFAULT NULL,
    email_verify_required TINYINT(1) NOT NULL DEFAULT 0,
    role ENUM('student', 'teacher', 'admin') NOT NULL,
    cabinet_scope ENUM('full', 'marathon') NOT NULL DEFAULT 'full',
    is_banned TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    last_seen_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_users_login (login),
    UNIQUE KEY uq_app_users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQL_FIND_BY_LOGIN = `
  SELECT u.id, u.login, u.password_hash, u.display_name, u.role, u.cabinet_scope,
         u.is_banned, u.email, u.email_verified_at, u.email_verify_required,
         UNIX_TIMESTAMP(a.updated_at) AS avatar_rev
  FROM ${AUTH_USERS_TABLE} u
  LEFT JOIN user_avatars a ON a.user_id = u.id
  WHERE LOWER(u.login) = ?
  LIMIT 1
`;

const SQL_FIND_BY_ID = `
  SELECT u.id, u.login, u.display_name, u.role, u.cabinet_scope, u.is_banned,
         u.email, u.email_verified_at, u.email_verify_required,
         UNIX_TIMESTAMP(a.updated_at) AS avatar_rev
  FROM ${AUTH_USERS_TABLE} u
  LEFT JOIN user_avatars a ON a.user_id = u.id
  WHERE u.id = ?
  LIMIT 1
`;

const SQL_FIND_BY_EMAIL = `
  SELECT u.id, u.login, u.password_hash, u.display_name, u.role, u.cabinet_scope,
         u.is_banned, u.email, u.email_verified_at, u.email_verify_required,
         UNIX_TIMESTAMP(a.updated_at) AS avatar_rev
  FROM ${AUTH_USERS_TABLE} u
  LEFT JOIN user_avatars a ON a.user_id = u.id
  WHERE u.email = ?
  LIMIT 1
`;

type UserRow = {
  id: number;
  login: string;
  password_hash?: string;
  display_name: string;
  role: UserRole;
  cabinet_scope?: string | null;
  is_banned?: number | boolean | null;
  email?: string | null;
  email_verified_at?: Date | string | null;
  email_verify_required?: number | boolean | null;
  avatar_rev?: number | string | null;
};

function mapAvatarRev(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return numeric;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function mapCabinetScope(value: unknown): CabinetScope {
  return value === "marathon" ? "marathon" : "full";
}

function mapUser(row: UserRow): AuthUser {
  const user: AuthUser = {
    id: row.id,
    login: row.login,
    displayName: row.display_name.trim(),
    role: row.role,
    cabinetScope: mapCabinetScope(row.cabinet_scope),
  };
  if (isTruthyFlag(row.is_banned)) {
    user.isBanned = true;
  }
  if (typeof row.email === "string" && row.email.trim()) {
    user.email = row.email.trim().toLowerCase();
  }
  if (row.email_verified_at) {
    const verified =
      row.email_verified_at instanceof Date
        ? row.email_verified_at
        : new Date(row.email_verified_at);
    if (!Number.isNaN(verified.getTime())) {
      user.emailVerified = true;
    }
  }
  if (isTruthyFlag(row.email_verify_required)) {
    user.emailVerifyRequired = true;
  }
  const avatarRev = mapAvatarRev(row.avatar_rev);
  if (avatarRev) {
    user.avatarRev = avatarRev;
  }
  return user;
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function ensureUserColumn(
  connection: SqlConnection,
  columnName: string,
  addColumnSql: string,
): Promise<boolean> {
  const rows = await connection.query<{
    COLUMN_NAME?: string;
    column_name?: string;
  }>(
    `SELECT COLUMN_NAME AS COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [AUTH_USERS_TABLE, columnName],
  );
  if (rows.length > 0) return false;
  await connection.execute(
    `ALTER TABLE ${AUTH_USERS_TABLE} ADD COLUMN ${addColumnSql}`,
    [],
  );
  return true;
}

/** Marathon accounts now use the full cabinet. Repeating the update is safe. */
async function promoteMarathonCabinetScope(
  connection: SqlConnection,
): Promise<void> {
  try {
    await connection.execute(
      `UPDATE ${AUTH_USERS_TABLE}
       SET cabinet_scope = 'full'
       WHERE cabinet_scope = 'marathon'`,
      [],
    );
  } catch (error) {
    const errno = (error as { errno?: number }).errno;
    if (errno === 1146 || errno === 1054) return;
    throw error;
  }
}

async function ensureEmailUniqueIndex(connection: SqlConnection): Promise<void> {
  const rows = await connection.query<{
    INDEX_NAME?: string;
    index_name?: string;
  }>(
    `SELECT INDEX_NAME AS INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = 'uq_app_users_email'
     LIMIT 1`,
    [AUTH_USERS_TABLE],
  );
  if (rows.length > 0) return;
  await connection.execute(
    `ALTER TABLE ${AUTH_USERS_TABLE}
     ADD UNIQUE KEY uq_app_users_email (email)`,
    [],
  );
}

const AUTH_MIGRATIONS = [
  "001_app_users.sql",
  "015_user_avatars.sql",
  "020_app_users_is_banned.sql",
  "021_app_users_presence.sql",
  "022_app_users_email.sql",
  "036_app_users_email_verify_required.sql",
  "041_marathon_student_access.sql",
  "045_cabinet_scope_full.sql",
];

async function runAuthSchemaMigration(connection: SqlConnection): Promise<void> {
  await connection.execute(SQL_CREATE_USERS, []);
    await ensureUserColumn(
      connection,
      "is_banned",
      "is_banned TINYINT(1) NOT NULL DEFAULT 0 AFTER role",
    );
    await ensureUserColumn(
      connection,
      "cabinet_scope",
      "cabinet_scope ENUM('full','marathon') NOT NULL DEFAULT 'full' AFTER role",
    );
    await promoteMarathonCabinetScope(connection);
    await ensureUserColumn(
      connection,
      "last_login_at",
      "last_login_at TIMESTAMP NULL DEFAULT NULL AFTER is_banned",
    );
    await ensureUserColumn(
      connection,
      "last_seen_at",
      "last_seen_at TIMESTAMP NULL DEFAULT NULL AFTER last_login_at",
    );
    await ensureUserColumn(
      connection,
      "email",
      "email VARCHAR(255) NULL DEFAULT NULL AFTER display_name",
    );
    await ensureUserColumn(
      connection,
      "email_verified_at",
      "email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER email",
    );
    await ensureUserColumn(
      connection,
      "email_verify_required",
      "email_verify_required TINYINT(1) NOT NULL DEFAULT 0 AFTER email_verified_at",
    );
    await ensureEmailUniqueIndex(connection);
    await connection.execute(SQL_CREATE_USER_AVATARS, []);
}

export async function ensureAuthSchema(
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  await ensureSchemaOnce(
    "auth",
    AUTH_MIGRATIONS,
    deps.getConnection,
    runAuthSchemaMigration,
  );
}

const SQL_LIST_STUDENTS = `
  SELECT id, display_name
  FROM ${AUTH_USERS_TABLE}
  WHERE role = 'student'
  ORDER BY display_name ASC, id ASC
`;

export type { StudentOption } from "./types";

export async function listStudents(
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<StudentOption[]> {
  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{ id: number; display_name: string }>(
      SQL_LIST_STUDENTS,
      [],
    );
    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name.trim(),
    }));
  } finally {
    connection.release();
  }
}

export async function findUserByLogin(
  login: string,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<(AuthUser & { passwordHash: string }) | null> {
  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<UserRow>(SQL_FIND_BY_LOGIN, [
      login.trim().toLowerCase(),
    ]);
    const row = rows[0];
    if (!row?.password_hash) return null;
    return { ...mapUser(row), passwordHash: row.password_hash };
  } finally {
    connection.release();
  }
}

export async function findUserById(
  userId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AuthUser | null> {
  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<UserRow>(SQL_FIND_BY_ID, [userId]);
    const row = rows[0];
    if (!row) return null;
    return mapUser(row);
  } finally {
    connection.release();
  }
}

export async function findUserByEmail(
  email: string,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<(AuthUser & { passwordHash: string }) | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<UserRow>(SQL_FIND_BY_EMAIL, [
      normalized,
    ]);
    const row = rows[0];
    if (!row?.password_hash) return null;
    return { ...mapUser(row), passwordHash: row.password_hash };
  } finally {
    connection.release();
  }
}

export async function markEmailVerified(
  userId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    await connection.execute(
      `UPDATE ${AUTH_USERS_TABLE}
       SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [userId],
    );
  } finally {
    connection.release();
  }
}

const SQL_INSERT_USER = `
  INSERT INTO ${AUTH_USERS_TABLE}
    (login, password_hash, display_name, role, email, email_verified_at, email_verify_required, cabinet_scope)
  VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
`;

export type CreateUserInput = {
  login: string;
  displayName: string;
  password: string;
  role?: UserRole;
  /** Required for public student registration; optional for teacher activation. */
  email?: string | null;
  /** Daily-marathon join sets `marathon`. Everything else stays `full`. */
  cabinetScope?: CabinetScope;
};

export type CreateUserRecordInput = {
  login: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  email?: string | null;
  cabinetScope?: CabinetScope;
};

export class CreateUserError extends Error {
  constructor(
    message: string,
    public readonly code: "login_taken" | "email_taken" | "db_error",
  ) {
    super(message);
    this.name = "CreateUserError";
  }
}

function mapDupOrThrow(error: unknown): never {
  const errno =
    typeof error === "object" && error !== null && "errno" in error
      ? Number((error as { errno?: number }).errno)
      : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);
  // MySQL ER_DUP_ENTRY
  if (errno === 1062) {
    if (/email/i.test(message) || /uq_app_users_email/i.test(message)) {
      throw new CreateUserError("Email already taken.", "email_taken");
    }
    throw new CreateUserError("Login already taken.", "login_taken");
  }
  console.error("createUserRecord: unexpected database error", error);
  throw new CreateUserError("Database operation failed.", "db_error");
}

/** Inserts on an already-open connection (caller owns the transaction / release). */
export async function insertUserOnConnection(
  connection: SqlConnection,
  input: CreateUserRecordInput,
): Promise<AuthUser> {
  try {
    const email =
      typeof input.email === "string" && input.email.trim()
        ? input.email.trim().toLowerCase()
        : null;
    const emailVerifyRequired = email ? 1 : 0;
    const cabinetScope: CabinetScope =
      input.cabinetScope === "marathon" ? "marathon" : "full";
    const result = await connection.execute(SQL_INSERT_USER, [
      input.login,
      input.passwordHash,
      input.displayName,
      input.role,
      email,
      emailVerifyRequired,
      cabinetScope,
    ]);
    return {
      id: result.insertId,
      login: input.login,
      displayName: input.displayName,
      role: input.role,
      cabinetScope,
      ...(email ? { email, emailVerifyRequired: true } : {}),
    };
  } catch (error) {
    mapDupOrThrow(error);
  }
}

/**
 * Inserts a user with an already-hashed password (e.g. paid teacher activation).
 * Public student registration should call `createUser` instead.
 */
export async function createUserRecord(
  input: CreateUserRecordInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AuthUser> {
  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    // Shared hosting does not always have autocommit. A bare INSERT then
    // stayed invisible to the next pooled connection, the verify-token FK
    // (023_auth_tokens.sql) failed, and the letter only left on resend.
    // START TRANSACTION also drops a leftover transaction on this socket.
    await connection.beginTransaction();
    const user = await insertUserOnConnection(connection, input);
    await connection.commit();
    return user;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // No open transaction, or the socket is already dead.
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Creates a new auth user. Public `/register` may create student or teacher.
 * Demo accounts keep fixed ids 1–3 via seed upsert.
 */
export async function createUser(
  input: CreateUserInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AuthUser> {
  const role: UserRole = input.role ?? "student";
  return createUserRecord(
    {
      login: input.login,
      displayName: input.displayName,
      passwordHash: hashPassword(input.password),
      role,
      email: input.email ?? null,
      cabinetScope: input.cabinetScope,
    },
    deps,
  );
}

const SQL_UPDATE_PASSWORD = `
  UPDATE ${AUTH_USERS_TABLE}
  SET password_hash = ?
  WHERE id = ?
`;

export class UpdatePasswordError extends Error {
  constructor(
    message: string,
    public readonly code: "db_error",
  ) {
    super(message);
    this.name = "UpdatePasswordError";
  }
}

export async function updateUserPassword(
  userId: number,
  password: string,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_UPDATE_PASSWORD, [
      hashPassword(password),
      userId,
    ]);
  } catch (error) {
    console.error("updateUserPassword: unexpected database error", error);
    throw new UpdatePasswordError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}
