import type { SqlConnection } from "@/lib/db/mysql";
import assert from "node:assert/strict";
import test from "node:test";

import { createMentorAssignment } from "./assignments";
import { MentorAssignmentsError } from "./types";

type Call = { sql: string; params: unknown[] };

function harness(options: {
  pool?: Array<{ id: number }>;
  ready?: {
    id: number;
    teacher_user_id: number;
    theme_id: number;
    difficulty: number;
    title: string;
    task_count: number;
  } | null;
}) {
  const executes: Call[] = [];
  let taskSessionId = 100;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM sessions") && sql.includes("task_count")) {
        return options.ready ? [options.ready] : [];
      }
      if (sql.includes("FROM themes")) {
        return [{ id: Number(params[0]), name: "Дроби" }];
      }
      if (sql.includes("SELECT id FROM quiz_tasks")) {
        return options.pool ?? [{ id: 10 }, { id: 11 }];
      }
      if (sql.includes("FROM teacher_students")) {
        return [{ student_user_id: 5 }];
      }
      if (sql.includes("FROM session_tasks")) return [];
      if (sql.includes("FROM mentor_assignments")) {
        return [
          {
            id: 9,
            teacher_user_id: 3,
            theme_id: options.ready?.theme_id ?? 4,
            difficulty: options.ready?.difficulty ?? 1,
            theme_name: "Дроби",
            tasks_number: 2,
            available_at: 1_000,
            due_at: 2_000,
            schedule_mode: "now",
            status: "active",
            created_at: 1_000,
            learning_session_id: options.ready?.id ?? 50,
            session_title: "Дроби · рівень 1",
          },
        ];
      }
      if (sql.includes("FROM mentor_assignment_members")) return [];
      return [];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      executes.push({ sql, params });
      if (sql.includes("INSERT INTO sessions")) {
        return { insertId: 50, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO session_tasks")) {
        return { insertId: 1, affectedRows: params.length / 3 };
      }
      if (sql.includes("INSERT INTO mentor_assignments")) {
        return { insertId: 9, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO task_sessions")) {
        taskSessionId += 1;
        return { insertId: taskSessionId, affectedRows: 1 };
      }
      return { insertId: 1, affectedRows: 1 };
    },
  } as SqlConnection;

  return { connection, executes };
}

const base = {
  teacherUserId: 3,
  themeId: 4,
  difficulty: 1,
  studentIds: [5],
  scheduleMode: "now" as const,
  dueAtUnix: 2_000,
};

test("quick assign freezes a teacher session and links the assignment", async () => {
  const { connection, executes } = harness({ pool: [{ id: 10 }, { id: 11 }] });
  const detail = await createMentorAssignment(base, {
    getConnection: async () => connection,
    nowSec: () => 1_000,
    ensureSchema: async () => {},
    notify: async () => {},
  });

  assert.equal(detail.id, 9);
  assert.equal(detail.learningSessionId, 50);
  const sessionInsert = executes.find((call) => call.sql.includes("INSERT INTO sessions"));
  assert.ok(sessionInsert);
  assert.match(String(sessionInsert?.sql), /'quick'/);
  assert.equal(sessionInsert?.params[0], 3);
  assert.equal(sessionInsert?.params[2], 4);

  const tasksInsert = executes.find((call) =>
    call.sql.includes("INSERT INTO session_tasks"),
  );
  const stored = new Set<number>();
  const params = tasksInsert?.params ?? [];
  for (let index = 1; index < params.length; index += 3) {
    stored.add(Number(params[index]));
  }
  assert.deepEqual([...stored].sort((a, b) => a - b), [10, 11]);

  const assignment = executes.find((call) =>
    call.sql.includes("INSERT INTO mentor_assignments"),
  );
  assert.equal(assignment?.params[1], 50);
  assert.equal(assignment?.params[4], 2);
});

test("assigning a ready session does not create another one", async () => {
  const { connection, executes } = harness({
    ready: {
      id: 70,
      teacher_user_id: 3,
      theme_id: 8,
      difficulty: 3,
      title: "Контрольна",
      task_count: 4,
    },
  });
  await createMentorAssignment(
    { ...base, themeId: 0, difficulty: 0, sessionId: 70 },
    {
      getConnection: async () => connection,
      nowSec: () => 1_000,
      ensureSchema: async () => {},
      notify: async () => {},
    },
  );

  assert.equal(
    executes.some((call) => call.sql.includes("INSERT INTO sessions")),
    false,
  );
  const assignment = executes.find((call) =>
    call.sql.includes("INSERT INTO mentor_assignments"),
  );
  assert.equal(assignment?.params[1], 70);
  assert.equal(assignment?.params[2], 8);
  assert.equal(assignment?.params[3], 3);
  assert.equal(assignment?.params[4], 4);
});

test("an empty ready session is rejected", async () => {
  const { connection, executes } = harness({
    ready: {
      id: 70,
      teacher_user_id: 3,
      theme_id: 8,
      difficulty: 1,
      title: "Порожня",
      task_count: 0,
    },
  });
  await assert.rejects(
    () =>
      createMentorAssignment(
        { ...base, sessionId: 70 },
        {
          getConnection: async () => connection,
          nowSec: () => 1_000,
          ensureSchema: async () => {},
          notify: async () => {},
        },
      ),
    (error: unknown) =>
      error instanceof MentorAssignmentsError && error.code === "session_empty",
  );
  assert.equal(
    executes.some((call) => call.sql.includes("INSERT INTO mentor_assignments")),
    false,
  );
});

test("another teacher's session cannot be assigned", async () => {
  const { connection } = harness({
    ready: {
      id: 70,
      teacher_user_id: 9,
      theme_id: 8,
      difficulty: 1,
      title: "Чужа",
      task_count: 2,
    },
  });
  await assert.rejects(
    () =>
      createMentorAssignment(
        { ...base, sessionId: 70 },
        {
          getConnection: async () => connection,
          nowSec: () => 1_000,
          ensureSchema: async () => {},
          notify: async () => {},
        },
      ),
    (error: unknown) =>
      error instanceof MentorAssignmentsError && error.code === "forbidden",
  );
});
