/**
 * Local fixture data for a fresh MySQL from docker-compose.yml.
 * Does not run on deploy. Refuses any host that is not loopback and any
 * database name that looks like the hosting schema.
 *
 *   npm run db:seed
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRYPT_KEY_LEN = 32;

/** Same password for every local account. Not a production secret. */
export const LOCAL_PASSWORD = "local-dev-pass";

export const LOCAL_ACCOUNTS = [
  {
    login: "local-student",
    email: "local-student@example.com",
    displayName: "Локальний учень",
    role: "student",
  },
  {
    login: "local-teacher",
    email: "local-teacher@example.com",
    displayName: "Локальний викладач",
    role: "teacher",
  },
  {
    login: "local-admin",
    email: "local-admin@example.com",
    displayName: "Локальний адмін",
    role: "admin",
  },
  {
    login: "local-dev",
    email: "local-dev@example.com",
    displayName: "Локальний розробник",
    role: "dev",
  },
];

export const LOCAL_MARATHON_SLUG = "local-daily";

const THEMES = [
  {
    id: 9101,
    code: "LOCAL-ALG-LINEAR",
    name: "Лінійні рівняння",
    description: "Локальні задачі для тесту за темою.",
    ord: 9101,
    tasks: [
      {
        id: 91001,
        name: "Рівняння 2x + 6 = 14",
        taskText: "Розв'яжіть рівняння 2x + 6 = 14.",
        answers: ["2", "4", "6", "10"],
        right: 2,
        comments: "2x = 8, тому x = 4.",
      },
      {
        id: 91002,
        name: "Рівняння 5x − 3 = 12",
        taskText: "Розв'яжіть рівняння 5x − 3 = 12.",
        answers: ["2", "3", "4", "5"],
        right: 2,
        comments: "5x = 15, тому x = 3.",
      },
      {
        id: 91003,
        name: "Рівняння x / 2 = 7",
        taskText: "Знайдіть x, якщо x / 2 = 7.",
        answers: ["3,5", "7", "14", "9"],
        right: 3,
        comments: "x = 7 · 2 = 14.",
      },
    ],
  },
  {
    id: 9102,
    code: "LOCAL-ALG-QUADRATIC",
    name: "Квадратні рівняння",
    description: "Локальні задачі для другої теми.",
    ord: 9102,
    tasks: [
      {
        id: 91004,
        name: "Корені x² − 5x + 6 = 0",
        taskText: "Які корені рівняння x² − 5x + 6 = 0?",
        answers: ["2 і 3", "1 і 6", "−2 і −3", "2 і 4"],
        right: 1,
        comments: "(x − 2)(x − 3) = 0, корені 2 і 3.",
      },
      {
        id: 91005,
        name: "Дискримінант x² − 4x + 4",
        taskText: "Чому дорівнює дискримінант рівняння x² − 4x + 4 = 0?",
        answers: ["0", "4", "8", "16"],
        right: 1,
        comments: "D = 16 − 16 = 0.",
      },
      {
        id: 91006,
        name: "Дійсні корені x² + 1 = 0",
        taskText: "Скільки дійсних коренів має рівняння x² + 1 = 0?",
        answers: ["жодного", "один", "два", "три"],
        right: 1,
        comments: "D = −4 < 0, дійсних коренів немає.",
      },
    ],
  },
  {
    id: 9103,
    code: "LOCAL-GEO-TRIANGLES",
    name: "Трикутники",
    description: "Локальні задачі з геометрії.",
    ord: 9103,
    tasks: [
      {
        id: 91007,
        name: "Сума кутів трикутника",
        taskText: "Чому дорівнює сума внутрішніх кутів трикутника?",
        answers: ["90°", "180°", "270°", "360°"],
        right: 2,
        comments: "Сума внутрішніх кутів трикутника — 180°.",
      },
      {
        id: 91008,
        name: "Кут при вершині",
        taskText: "У рівнобедреному трикутнику кути при основі по 70°. Який кут при вершині?",
        answers: ["40°", "50°", "70°", "110°"],
        right: 1,
        comments: "180° − 70° − 70° = 40°.",
      },
      {
        id: 91009,
        name: "Гіпотенуза 3-4-5",
        taskText: "Катети прямокутного трикутника дорівнюють 3 і 4. Чому дорівнює гіпотенуза?",
        answers: ["5", "6", "7", "12"],
        right: 1,
        comments: "3² + 4² = 25, гіпотенуза 5.",
      },
    ],
  },
];

export function hashLocalPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

/** Loopback only. Hosting names and the production bind address stay out. */
export function isLocalDatabaseTarget(env) {
  const host = String(env.DB_HOST ?? "").trim().toLowerCase();
  const name = String(env.DB_NAME ?? "").trim().toLowerCase();
  if (!host || !name) return false;
  if (name.includes("levelhst")) return false;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Немає ${name}. Скопіюй .env.example у .env.local.`);
  return value;
}

function kyivDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function seed(conn) {
  const [applied] = await conn.query(
    "SELECT version FROM schema_migrations WHERE version = ?",
    ["067_workbook_catalog.sql"],
  );
  if (!Array.isArray(applied) || applied.length === 0) {
    throw new Error("Спершу npm run migrate. У журналі немає 067_workbook_catalog.sql.");
  }

  for (const account of LOCAL_ACCOUNTS) {
    const passwordHash = hashLocalPassword(LOCAL_PASSWORD);
    await conn.query(
      `INSERT INTO app_users
         (login, password_hash, display_name, role, email, email_verified_at, email_verify_required, cabinet_scope, is_banned)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0, 'full', 0) AS incoming
       ON DUPLICATE KEY UPDATE
         password_hash = incoming.password_hash,
         display_name = incoming.display_name,
         role = incoming.role,
         email = incoming.email,
         email_verified_at = COALESCE(app_users.email_verified_at, CURRENT_TIMESTAMP),
         email_verify_required = 0,
         cabinet_scope = 'full',
         is_banned = 0`,
      [account.login, passwordHash, account.displayName, account.role, account.email],
    );
  }

  const [users] = await conn.query(
    "SELECT id, login FROM app_users WHERE login IN (?, ?, ?, ?)",
    LOCAL_ACCOUNTS.map((account) => account.login),
  );
  const userId = new Map(users.map((row) => [row.login, Number(row.id)]));

  for (const theme of THEMES) {
    await conn.query(
      `INSERT INTO themes (id, code, name, description, ord, difficulty_guide)
       VALUES (?, ?, ?, ?, ?, NULL) AS incoming
       ON DUPLICATE KEY UPDATE
         code = incoming.code,
         name = incoming.name,
         description = incoming.description,
         ord = incoming.ord`,
      [theme.id, theme.code, theme.name, theme.description, theme.ord],
    );
    for (const task of theme.tasks) {
      await conn.query(
        `INSERT INTO quiz_tasks
           (id, name, task_text, theme_id, answer_1, answer_2, answer_3, answer_4, right_answer_n, comments, difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1) AS incoming
         ON DUPLICATE KEY UPDATE
           name = incoming.name,
           task_text = incoming.task_text,
           theme_id = incoming.theme_id,
           answer_1 = incoming.answer_1,
           answer_2 = incoming.answer_2,
           answer_3 = incoming.answer_3,
           answer_4 = incoming.answer_4,
           right_answer_n = incoming.right_answer_n,
           comments = incoming.comments,
           difficulty = incoming.difficulty`,
        [
          task.id,
          task.name,
          task.taskText,
          theme.id,
          task.answers[0],
          task.answers[1],
          task.answers[2],
          task.answers[3],
          task.right,
          task.comments,
        ],
      );
    }
  }

  await conn.query("DELETE FROM marathons WHERE slug = ?", [LOCAL_MARATHON_SLUG]);
  const today = kyivDate(new Date());
  const nowSec = Math.floor(Date.now() / 1000);
  const [marathon] = await conn.query(
    `INSERT INTO marathons
       (slug, title, description, status, starts_at, ends_at, min_tasks_per_session,
        kind, subject, start_date, unlock_hour, reminder_hour, nudge_from, nudge_until,
        days_count, pass_threshold, final_cta_text, final_cta_url, intro_video_url,
        invite_audience, landing_riddle_count, public_chat_url)
     VALUES (?, ?, ?, 'active', ?, ?, 5, 'daily', 'math', ?, '00:00', '19:00', 10, 21,
             1, 60, ?, ?, NULL, 'none', 3, NULL)`,
    [
      LOCAL_MARATHON_SLUG,
      "Локальний марафон",
      "Тестовий денний курс для локальної бази. Не з продакшену.",
      nowSec,
      nowSec + 14 * 24 * 60 * 60,
      today,
      "До кабінету",
      "http://localhost:3000/",
    ],
  );
  const marathonId = Number(marathon.insertId);
  const [day] = await conn.query(
    `INSERT INTO marathon_days (marathon_id, day_number, topic, intro_text)
     VALUES (?, 1, ?, ?)`,
    [marathonId, "Локальний день", "Один день із двома короткими завданнями."],
  );
  const dayId = Number(day.insertId);
  await conn.query(
    `INSERT INTO marathon_day_materials (day_id, sort_order, material_type, url_or_body)
     VALUES (?, 1, 'text', ?)`,
    [dayId, "Це локальні дані. Листи й Telegram без власних ключів не відправляються."],
  );
  const dayTasks = [
    {
      prompt: "Скільки буде 7 × 8?",
      options: ["54", "56", "64", "48"],
      correct: 2,
      explanation: "7 × 8 = 56.",
    },
    {
      prompt: "Чому дорівнює 15 − 9?",
      options: ["5", "6", "7", "8"],
      correct: 2,
      explanation: "15 − 9 = 6.",
    },
  ];
  for (let index = 0; index < dayTasks.length; index += 1) {
    const task = dayTasks[index];
    await conn.query(
      `INSERT INTO marathon_day_tasks
         (day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
      [dayId, index + 1, task.prompt, JSON.stringify(task.options), task.correct, task.explanation],
    );
  }

  const studentId = userId.get("local-student");
  const teacherId = userId.get("local-teacher");
  if (!studentId || !teacherId) {
    throw new Error("Seed не знайшов local-student або local-teacher після вставки.");
  }
  await conn.query(
    `INSERT INTO marathon_participants (marathon_id, user_id, source)
     VALUES (?, ?, 'local-seed')`,
    [marathonId, studentId],
  );
  await conn.query(
    `UPDATE app_users SET cabinet_scope = 'full' WHERE login IN (?, ?, ?, ?)`,
    LOCAL_ACCOUNTS.map((account) => account.login),
  );
  await conn.query(
    `INSERT INTO teacher_students (teacher_user_id, student_user_id)
     VALUES (?, ?) AS incoming
     ON DUPLICATE KEY UPDATE teacher_user_id = incoming.teacher_user_id`,
    [teacherId, studentId],
  );
  await conn.query(
    `INSERT INTO teacher_profiles
       (user_id, slug, headline, bio, city, subjects, is_public, moderation_status)
     VALUES (?, 'local-teacher', ?, ?, 'Київ', 'Математика', 1, 'approved') AS incoming
     ON DUPLICATE KEY UPDATE
       headline = incoming.headline,
       bio = incoming.bio,
       city = incoming.city,
       subjects = incoming.subjects,
       is_public = 1,
       moderation_status = 'approved'`,
    [
      teacherId,
      "Локальна візитка",
      "Тестовий викладач локальної бази. Не публікувати як справжнього вчителя.",
    ],
  );
}

async function main() {
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(root, ".env"));
  required("DB_HOST");
  required("DB_USER");
  required("DB_PASSWORD");
  required("DB_NAME");
  if (!isLocalDatabaseTarget(process.env)) {
    throw new Error(
      `db:seed відмовився: ${process.env.DB_HOST}/${process.env.DB_NAME} не схоже на локальну базу. Прод-хост і levelhst не чіпаємо.`,
    );
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4",
  });
  try {
    await seed(conn);
  } finally {
    await conn.end();
  }

  console.log("Локальний seed готовий. Вхід за поштою, пароль у всіх однаковий.");
  console.log(`Пароль: ${LOCAL_PASSWORD}`);
  for (const account of LOCAL_ACCOUNTS) {
    console.log(`  ${account.role}: ${account.email}`);
  }
  console.log(`Марафон: /marathon/${LOCAL_MARATHON_SLUG}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
