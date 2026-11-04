import mysql from "mysql2/promise";

const TASKS_PER_THEME = 5;
const SMOKE_THEME_ID = 99901;

/** Five starter tasks per theme — Ukrainian NMT-style multiple choice. */
const TASK_TEMPLATES = [
  {
    name: "Базове завдання 1",
    taskText: "Обчисліть: 12 + 8",
    answers: ["18", "20", "22", "19"],
    right: 2,
    comments: "Правильна відповідь: 20",
  },
  {
    name: "Базове завдання 2",
    taskText: "Обчисліть: 45 − 17",
    answers: ["26", "28", "27", "29"],
    right: 2,
    comments: "Правильна відповідь: 28",
  },
  {
    name: "Базове завдання 3",
    taskText: "Обчисліть: 6 × 7",
    answers: ["42", "36", "48", "40"],
    right: 1,
    comments: "Правильна відповідь: 42",
  },
  {
    name: "Базове завдання 4",
    taskText: "Обчисліть: 56 ÷ 8",
    answers: ["6", "7", "8", "9"],
    right: 2,
    comments: "Правильна відповідь: 7",
  },
  {
    name: "Базове завдання 5",
    taskText: "Обчисліть: 3² + 4",
    answers: ["12", "13", "14", "16"],
    right: 2,
    comments: "Правильна відповідь: 13",
  },
];

function themedTaskText(themeName, index) {
  return `[${themeName}] Завдання ${index + 1}. ${TASK_TEMPLATES[index].taskText}`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await conn.beginTransaction();

    const [smokeTasks] = await conn.query(
      "SELECT id FROM quiz_tasks WHERE theme_id = ?",
      [SMOKE_THEME_ID],
    );
    const smokeIds = smokeTasks.map((row) => row.id);

    if (smokeIds.length > 0) {
      await conn.query(
        `DELETE FROM tasks2session WHERE task_id IN (${smokeIds.map(() => "?").join(",")})`,
        smokeIds,
      );
      await conn.query("DELETE FROM quiz_tasks WHERE theme_id = ?", [
        SMOKE_THEME_ID,
      ]);
    }

    await conn.query("DELETE FROM task_sessions WHERE theme_id = ?", [
      SMOKE_THEME_ID,
    ]);
    await conn.query("DELETE FROM themes WHERE id = ?", [SMOKE_THEME_ID]);

    const [maxRow] = await conn.query(
      "SELECT COALESCE(MAX(id), 0) AS maxId FROM quiz_tasks WHERE id < ?",
      [SMOKE_THEME_ID],
    );
    let nextId = Number(maxRow[0].maxId) + 1;

    // MATH-05-ELEM-OPS is retired. Do not fill it if a row is imported again.
    const [emptyThemes] = await conn.query(`
      SELECT t.id, t.name
      FROM themes t
      LEFT JOIN quiz_tasks q ON q.theme_id = t.id
      WHERE t.id <> ?
        AND t.code <> 'MATH-05-ELEM-OPS'
      GROUP BY t.id, t.name, t.ord
      HAVING COUNT(q.id) = 0
      ORDER BY t.ord ASC, t.id ASC
    `, [SMOKE_THEME_ID]);

    const insertSql = `
      INSERT INTO quiz_tasks
        (id, name, task_text, theme_id, answer_1, answer_2, answer_3, answer_4, right_answer_n, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    let inserted = 0;
    for (const theme of emptyThemes) {
      const themeName = String(theme.name).trim();
      for (let i = 0; i < TASKS_PER_THEME; i += 1) {
        const tpl = TASK_TEMPLATES[i];
        await conn.query(insertSql, [
          nextId,
          `${themeName}: ${tpl.name}`,
          themedTaskText(themeName, i),
          theme.id,
          tpl.answers[0],
          tpl.answers[1],
          tpl.answers[2],
          tpl.answers[3],
          tpl.right,
          tpl.comments,
        ]);
        nextId += 1;
        inserted += 1;
      }
    }

    await conn.commit();

    const [summary] = await conn.query(`
      SELECT t.id, t.name, COUNT(q.id) AS task_count
      FROM themes t
      LEFT JOIN quiz_tasks q ON q.theme_id = t.id
      GROUP BY t.id, t.name, t.ord
      HAVING task_count > 0
      ORDER BY t.ord ASC, t.id ASC
    `);

    console.log(`Removed smoke theme ${SMOKE_THEME_ID}.`);
    console.log(`Inserted ${inserted} tasks for ${emptyThemes.length} themes.`);
    console.log("Themes with tasks now:");
    for (const row of summary) {
      console.log(`  ${row.id}: ${String(row.name).trim()} — ${row.task_count}`);
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
