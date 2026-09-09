import type { SqlConnection } from "@/lib/db/mysql";

/** `tasks2session.task_type` for rows that point at `nmt_quiz_tasks`. */
export const TASK_TYPE_NMT = 4;
export const NMT_SIMULATOR_TASK_COUNT = 22;
export const SESSION_TYPE_NMT_SIMULATOR = 4;

const SESSION_STATUS_CREATED = 2;
const SESSION_START_TIME = 0;
const SESSION_INITIAL_RIGHT_NUMBER = 0;
const SESSION_INITIAL_TIME = 0;
const TASK_STATUS_UNANSWERED = 0;

export type StartNmtSimulatorInput = {
  userId: number;
  /** Concrete variant, or `"random"` among published ones. */
  variantId: number | "random";
};

export type StartNmtSimulatorResult = {
  sessionId: number;
  variantId: number;
  taskIds: number[];
};

export type StartNmtSimulatorErrorCode =
  | "invalid_input"
  | "variant_not_found"
  | "insufficient_tasks"
  | "already_in_progress"
  | "db_error";

export class StartNmtSimulatorError extends Error {
  constructor(
    message: string,
    public readonly code: StartNmtSimulatorErrorCode,
  ) {
    super(message);
    this.name = "StartNmtSimulatorError";
  }
}

type StartNmtSimulatorDeps = {
  getConnection: () => Promise<SqlConnection>;
};

const pendingUserIds = new Set<number>();

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

const SQL_RANDOM_VARIANT = `
  SELECT id FROM nmt_variants
  WHERE is_published = 1
  ORDER BY RAND()
  LIMIT 1
`;

const SQL_VARIANT = `
  SELECT id, tasks_number
  FROM nmt_variants
  WHERE id = ? AND is_published = 1
`;

const SQL_VARIANT_TASKS = `
  SELECT nvt.task_id AS id
  FROM nmt_variant_tasks nvt
  INNER JOIN nmt_quiz_tasks t ON t.id = nvt.task_id
  WHERE nvt.variant_id = ?
  ORDER BY nvt.ord ASC
`;

const SQL_INSERT_SESSION = `
  INSERT INTO task_sessions
    (
      user_id,
      session_type,
      theme_id,
      nmt_variant_id,
      tasks_number,
      right_number,
      time,
      session_status,
      start_time
    )
  VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
`;

const SQL_INSERT_MAPPING_PREFIX = `
  INSERT INTO tasks2session
    (task_type, task_id, session_id, user_id, status)
  VALUES
`;

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function resolveNmtVariantId(
  variantId: unknown,
): number | "random" {
  if (variantId === "random") return "random";
  if (typeof variantId === "string" && variantId === "random") return "random";
  if (isPositiveInt(variantId)) return variantId;
  if (typeof variantId === "string" && /^\d+$/.test(variantId)) {
    const n = Number(variantId);
    if (isPositiveInt(n)) return n;
  }
  throw new StartNmtSimulatorError(
    "variantId must be a positive integer or \"random\".",
    "invalid_input",
  );
}

export async function startNmtSimulator(
  userId: number,
  variantId: number | "random" = "random",
  deps: StartNmtSimulatorDeps = { getConnection: loadDefaultConnection },
): Promise<StartNmtSimulatorResult> {
  if (!isPositiveInt(userId)) {
    throw new StartNmtSimulatorError(
      "Неправильний ID користувача.",
      "invalid_input",
    );
  }

  const resolvedVariant = resolveNmtVariantId(variantId);

  if (pendingUserIds.has(userId)) {
    throw new StartNmtSimulatorError(
      "Запит на запуск симулятора обробляється.",
      "already_in_progress",
    );
  }

  pendingUserIds.add(userId);

  try {
    const connection = await deps.getConnection();

    try {
      await connection.beginTransaction();

      let variantPk: number;
      if (resolvedVariant === "random") {
        const picked = await connection.query<{ id: number }>(SQL_RANDOM_VARIANT);
        if (!picked[0]) {
          await connection.rollback();
          throw new StartNmtSimulatorError(
            "Немає опублікованих варіантів НМТ.",
            "variant_not_found",
          );
        }
        variantPk = picked[0].id;
      } else {
        const found = await connection.query<{ id: number; tasks_number: number }>(
          SQL_VARIANT,
          [resolvedVariant],
        );
        if (!found[0]) {
          await connection.rollback();
          throw new StartNmtSimulatorError(
            "Варіант НМТ не знайдено.",
            "variant_not_found",
          );
        }
        variantPk = found[0].id;
      }

      const tasks = await connection.query<{ id: number }>(SQL_VARIANT_TASKS, [
        variantPk,
      ]);

      if (tasks.length === 0) {
        await connection.rollback();
        throw new StartNmtSimulatorError(
          "У цього варіанта немає завдань.",
          "insufficient_tasks",
        );
      }

      const session = await connection.execute(SQL_INSERT_SESSION, [
        userId,
        SESSION_TYPE_NMT_SIMULATOR,
        variantPk,
        tasks.length,
        SESSION_INITIAL_RIGHT_NUMBER,
        SESSION_INITIAL_TIME,
        SESSION_STATUS_CREATED,
        SESSION_START_TIME,
      ]);

      const placeholders = tasks.map(() => "(?, ?, ?, ?, ?)").join(", ");
      const mappingParams = tasks.flatMap((task) => [
        TASK_TYPE_NMT,
        task.id,
        session.insertId,
        userId,
        TASK_STATUS_UNANSWERED,
      ]);

      const mapping = await connection.execute(
        SQL_INSERT_MAPPING_PREFIX + placeholders,
        mappingParams,
      );

      if (mapping.affectedRows !== tasks.length) {
        await connection.rollback();
        throw new StartNmtSimulatorError(
          "Не вдалося зв’язати всі завдання симулятора.",
          "db_error",
        );
      }

      await connection.commit();

      return {
        sessionId: session.insertId,
        variantId: variantPk,
        taskIds: tasks.map((task) => task.id),
      };
    } catch (error) {
      if (!(error instanceof StartNmtSimulatorError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof StartNmtSimulatorError) throw error;

    console.error("startNmtSimulator: Помилка бази даних", error);
    throw new StartNmtSimulatorError(
      "Помилка під час роботи з базою даних.",
      "db_error",
    );
  } finally {
    pendingUserIds.delete(userId);
  }
}
