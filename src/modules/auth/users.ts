import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser, UserRole, StudentOption } from "./types";
import { DEMO_ACCOUNTS } from "./types";
import { hashPassword } from "./password";

const AUTH_USERS_TABLE = "app_users";

const SQL_CREATE_USERS = `
  CREATE TABLE IF NOT EXISTS ${AUTH_USERS_TABLE} (
    id INT NOT NULL AUTO_INCREMENT,
    login VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    role ENUM('student', 'teacher', 'admin') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_users_login (login)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQL_FIND_BY_LOGIN = `
  SELECT id, login, password_hash, display_name, role
  FROM ${AUTH_USERS_TABLE}
  WHERE login = ?
  LIMIT 1
`;

const SQL_FIND_BY_ID = `
  SELECT id, login, display_name, role
  FROM ${AUTH_USERS_TABLE}
  WHERE id = ?
  LIMIT 1
`;

const SQL_COUNT_USERS = `SELECT COUNT(*) AS count FROM ${AUTH_USERS_TABLE}`;

const SQL_UPSERT_DEMO = `
  INSERT INTO ${AUTH_USERS_TABLE} (id, login, password_hash, display_name, role)
  VALUES (?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    login = VALUES(login),
    password_hash = VALUES(password_hash),
    display_name = VALUES(display_name),
    role = VALUES(role)
`;

type UserRow = {
  id: number;
  login: string;
  password_hash?: string;
  display_name: string;
  role: UserRole;
};

type CountRow = { count: number };

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    login: row.login,
    displayName: row.display_name.trim(),
    role: row.role,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

async function runAuthSchemaMigration(
  deps: { getConnection: () => Promise<SqlConnection> },
): Promise<void> {
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_CREATE_USERS, []);
    await seedDemoUsers(connection);
  } finally {
    connection.release();
  }
}

export async function ensureAuthSchema(
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runAuthSchemaMigration(deps).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

async function seedDemoUsers(connection: SqlConnection): Promise<void> {
  const rows = await connection.query<CountRow>(SQL_COUNT_USERS, []);
  const count = rows[0]?.count ?? 0;
  if (count > 0) {
    return;
  }

  for (const account of DEMO_ACCOUNTS) {
    await connection.execute(SQL_UPSERT_DEMO, [
      account.id,
      account.login,
      hashPassword(account.password),
      account.displayName,
      account.role,
    ]);
  }
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
    const rows = await connection.query<UserRow>(SQL_FIND_BY_LOGIN, [login.trim()]);
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

const SQL_INSERT_USER = `
  INSERT INTO ${AUTH_USERS_TABLE} (login, password_hash, display_name, role)
  VALUES (?, ?, ?, ?)
`;

export type CreateUserInput = {
  login: string;
  displayName: string;
  password: string;
  role?: UserRole;
};

export class CreateUserError extends Error {
  constructor(
    message: string,
    public readonly code: "login_taken" | "db_error",
  ) {
    super(message);
    this.name = "CreateUserError";
  }
}

/**
 * Creates a new auth user. Public registration always uses role=student.
 * Demo accounts keep fixed ids 1–3 via seed upsert.
 */
export async function createUser(
  input: CreateUserInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AuthUser> {
  await ensureAuthSchema(deps);
  const role: UserRole = input.role ?? "student";
  const connection = await deps.getConnection();
  try {
    const result = await connection.execute(SQL_INSERT_USER, [
      input.login,
      hashPassword(input.password),
      input.displayName,
      role,
    ]);

    return {
      id: result.insertId,
      login: input.login,
      displayName: input.displayName,
      role,
    };
  } catch (error) {
    const errno =
      typeof error === "object" && error !== null && "errno" in error
        ? Number((error as { errno?: number }).errno)
        : undefined;
    // MySQL ER_DUP_ENTRY
    if (errno === 1062) {
      throw new CreateUserError("Login already taken.", "login_taken");
    }
    console.error("createUser: unexpected database error", error);
    throw new CreateUserError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
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
