import fs from "node:fs";
import path from "node:path";

import { TASKS_BY_THEME } from "./content/quiz-tasks-source.mjs";

const DIFFICULTY_DESCRIPTION = {
  1: "Базовий рівень НМТ: одна основна ідея, 1–2 кроки розв'язання, без очевидно дитячих завдань.",
  2: "Середній рівень НМТ: поєднання кількох правил або 2–4 кроки розв'язання.",
  3: "Складний рівень НМТ: багатокрокове розв'язання, аналіз умов або поєднання кількох понять теми.",
};

const TARGET_TASKS_PER_THEME = 36;
const FIRST_NEW_TASK_ID = 121;

const THEMES = [
  { id: 1, name: "Елементарні дії", existing: 5 },
  { id: 2, name: "Арифметичні дії", existing: 10 },
  { id: 3, name: "Елементарна планіметрія", existing: 5 },
  { id: 4, name: "Рівності та нерівності", existing: 5 },
  { id: 5, name: "Дроби", existing: 5 },
  { id: 6, name: "Математичні вирази", existing: 5 },
  { id: 7, name: "Обрахункова геометрія", existing: 5 },
  { id: 8, name: "Рівняння", existing: 5 },
  { id: 9, name: "Доказова геометрія", existing: 5 },
  { id: 10, name: "Ступені та корені", existing: 5 },
  { id: 11, name: "Квадратні рівняння", existing: 5 },
  { id: 12, name: "Текстові задачі", existing: 5 },
  { id: 13, name: "Координатна площина", existing: 5 },
  { id: 14, name: "Функції", existing: 5 },
  { id: 15, name: "Логарифми", existing: 5 },
  { id: 16, name: "Тригонометрія", existing: 5 },
  { id: 17, name: "Границі функції", existing: 5 },
  { id: 18, name: "Похідна функції", existing: 5 },
  { id: 19, name: "Первісна функції та інтеграли", existing: 5 },
  { id: 20, name: "Стереометрія", existing: 5 },
  { id: 21, name: "Комбінаторика. Прогресії.", existing: 5 },
  { id: 22, name: "Теорія ймовірностей", existing: 5 },
  { id: 23, name: "Математична статистика", existing: 5 },
];

const EXISTING_TASK_IDS_BY_THEME = {
  1: [11, 12, 13, 14, 15],
  2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  3: [16, 17, 18, 19, 20],
  4: [21, 22, 23, 24, 25],
  5: [26, 27, 28, 29, 30],
  6: [31, 32, 33, 34, 35],
  7: [36, 37, 38, 39, 40],
  8: [41, 42, 43, 44, 45],
  9: [46, 47, 48, 49, 50],
  10: [51, 52, 53, 54, 55],
  11: [56, 57, 58, 59, 60],
  12: [61, 62, 63, 64, 65],
  13: [66, 67, 68, 69, 70],
  14: [71, 72, 73, 74, 75],
  15: [76, 77, 78, 79, 80],
  16: [81, 82, 83, 84, 85],
  17: [86, 87, 88, 89, 90],
  18: [91, 92, 93, 94, 95],
  19: [96, 97, 98, 99, 100],
  20: [101, 102, 103, 104, 105],
  21: [106, 107, 108, 109, 110],
  22: [111, 112, 113, 114, 115],
  23: [116, 117, 118, 119, 120],
};

function getDifficultyPlan() {
  return {
    1: 12,
    2: 12,
    3: 12,
  };
}

// -----------------------------------------------------------------------------
// Validate source content before assigning IDs.
// -----------------------------------------------------------------------------

const totalNewTasks = THEMES.length * TARGET_TASKS_PER_THEME;

console.log(`New tasks to generate: ${totalNewTasks}`);

for (const theme of THEMES) {
  const plan = getDifficultyPlan();
  const total = plan[1] + plan[2] + plan[3];

  console.log(
    `${theme.id}. ${theme.name}: +${total} (${plan[1]}/${plan[2]}/${plan[3]})`,
  );
}

for (const theme of THEMES) {
  const tasks = TASKS_BY_THEME[theme.id] ?? [];
  const plan = getDifficultyPlan();

  const counts = {
    1: tasks.filter((task) => task.difficulty === 1).length,
    2: tasks.filter((task) => task.difficulty === 2).length,
    3: tasks.filter((task) => task.difficulty === 3).length,
  };

  if (tasks.length !== TARGET_TASKS_PER_THEME) {
    throw new Error(
      `Theme ${theme.id} "${theme.name}": expected ${TARGET_TASKS_PER_THEME} tasks, got ${tasks.length}`,
    );
  }

  for (const difficulty of [1, 2, 3]) {
    if (counts[difficulty] !== plan[difficulty]) {
      throw new Error(
        `Theme ${theme.id} "${theme.name}": expected ${plan[difficulty]} tasks with difficulty ${difficulty}, got ${counts[difficulty]}`,
      );
    }
  }

  const seenTaskTexts = new Set();

  for (const [index, task] of tasks.entries()) {
    const label = `Theme ${theme.id}, task ${index + 1}`;

    if (typeof task.text !== "string" || !task.text.trim()) {
      throw new Error(`${label}: text is missing`);
    }

    const normalizedText = task.text.trim().toLowerCase();

    if (seenTaskTexts.has(normalizedText)) {
      throw new Error(`${label}: duplicate task text`);
    }

    seenTaskTexts.add(normalizedText);

    if (!Array.isArray(task.answers) || task.answers.length !== 4) {
      throw new Error(`${label}: expected exactly 4 answers`);
    }

    const normalizedAnswers = task.answers.map((answer) =>
      typeof answer === "string" ? answer.trim().toLowerCase() : answer,
    );

    if (new Set(normalizedAnswers).size !== 4) {
      throw new Error(`${label}: duplicate answers found`);
    }

    for (const [answerIndex, answer] of task.answers.entries()) {
      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error(`${label}: answer ${answerIndex + 1} is empty`);
      }

      if (answer.length > 255) {
        throw new Error(
          `${label}: answer ${answerIndex + 1} exceeds 255 characters`,
        );
      }
    }

    if (
      !Number.isInteger(task.correct) ||
      task.correct < 1 ||
      task.correct > 4
    ) {
      throw new Error(`${label}: correct must be an integer from 1 to 4`);
    }

    if (typeof task.comment !== "string" || !task.comment.trim()) {
      throw new Error(`${label}: comment is missing`);
    }

    if (![1, 2, 3].includes(task.difficulty)) {
      throw new Error(`${label}: difficulty must be 1, 2 or 3`);
    }
  }

  console.log(
    `Content ${theme.id}: ${tasks.length}/${TARGET_TASKS_PER_THEME} (${counts[1]}/${counts[2]}/${counts[3]})`,
  );
}

// -----------------------------------------------------------------------------
// Assign IDs.
// Existing invalid tasks are overwritten using their current IDs.
// Remaining tasks receive new IDs starting from 121.
// -----------------------------------------------------------------------------

let nextNewTaskId = FIRST_NEW_TASK_ID;

function assignTaskIds(themeId, tasks) {
  const existingIds = EXISTING_TASK_IDS_BY_THEME[themeId] ?? [];

  return tasks.map((task, index) => {
    const id =
      index < existingIds.length ? existingIds[index] : nextNewTaskId++;

    return {
      id,
      theme_id: themeId,
      ...task,
    };
  });
}

const QUIZ_TASKS = THEMES.flatMap((theme) =>
  assignTaskIds(theme.id, TASKS_BY_THEME[theme.id] ?? []),
);

// -----------------------------------------------------------------------------
// Convert source tasks to the exact quiz_tasks import format.
// -----------------------------------------------------------------------------

const IMPORT_QUIZ_TASKS = [];

for (const theme of THEMES) {
  const themeTasks = QUIZ_TASKS.filter((task) => task.theme_id === theme.id);

  themeTasks.forEach((task, index) => {
    IMPORT_QUIZ_TASKS.push({
      id: task.id,
      name: `${theme.name} — ${index + 1}`,
      task_text: task.text,
      theme_id: task.theme_id,
      answer_1: task.answers[0],
      answer_2: task.answers[1],
      answer_3: task.answers[2],
      answer_4: task.answers[3],
      right_answer_n: task.correct,
      comments: task.comment,
      difficulty: task.difficulty,
    });
  });
}

if (IMPORT_QUIZ_TASKS.length !== 828) {
  throw new Error(
    `Expected 828 import quiz tasks, got ${IMPORT_QUIZ_TASKS.length}`,
  );
}

for (const task of IMPORT_QUIZ_TASKS) {
  if (task.name.length > 100) {
    throw new Error(`Task ${task.id}: name exceeds 100 characters`);
  }

  if (task.comments.length > 65535) {
    throw new Error(`Task ${task.id}: comments exceed allowed length`);
  }
}

console.log(`Prepared ${IMPORT_QUIZ_TASKS.length} quiz tasks for import.`);

// -----------------------------------------------------------------------------
// Validate assigned IDs.
// -----------------------------------------------------------------------------

const taskIds = QUIZ_TASKS.map((task) => task.id);

if (QUIZ_TASKS.length !== totalNewTasks) {
  throw new Error(
    `Expected ${totalNewTasks} quiz tasks, got ${QUIZ_TASKS.length}`,
  );
}

if (new Set(taskIds).size !== QUIZ_TASKS.length) {
  throw new Error("Duplicate quiz task IDs found");
}

const existingTaskIds = taskIds.filter((id) => id < FIRST_NEW_TASK_ID);
const newTaskIds = taskIds.filter((id) => id >= FIRST_NEW_TASK_ID);

if (existingTaskIds.length !== 120) {
  throw new Error(
    `Expected 120 reused task IDs, got ${existingTaskIds.length}`,
  );
}

if (newTaskIds.length !== 708) {
  throw new Error(`Expected 708 new task IDs, got ${newTaskIds.length}`);
}

if (
  Math.min(...newTaskIds) !== FIRST_NEW_TASK_ID ||
  Math.max(...newTaskIds) !== 828
) {
  throw new Error(
    `Expected new task IDs ${FIRST_NEW_TASK_ID}–828, got ${Math.min(...newTaskIds)}–${Math.max(...newTaskIds)}`,
  );
}

const expectedAllIds = Array.from({ length: 828 }, (_, index) => index + 1);

const sortedTaskIds = [...taskIds].sort((a, b) => a - b);

for (let index = 0; index < expectedAllIds.length; index += 1) {
  if (sortedTaskIds[index] !== expectedAllIds[index]) {
    throw new Error(
      `Expected complete task ID range 1–828; problem near ID ${expectedAllIds[index]}`,
    );
  }
}

console.log(
  `Assigned ${QUIZ_TASKS.length} unique IDs: 120 reused + ${newTaskIds.length} new (${Math.min(...newTaskIds)}–${Math.max(...newTaskIds)}).`,
);

console.log(`Validated ${totalNewTasks} tasks successfully.`);

// -----------------------------------------------------------------------------
// Generate import JSON and content-review Markdown.
// -----------------------------------------------------------------------------

const OUTPUT_DATE = "2026-09-05";

const importOutputPath = path.resolve(
  `scripts/content/quiz-tasks-import-${OUTPUT_DATE}.json`,
);

const reviewOutputPath = path.resolve(
  `docs/content-review/quiz-tasks-${OUTPUT_DATE}.md`,
);

const importPayload = {
  themes: [
    {
      id: 1,
      name: "Елементарні дії",
      description: "віднесення до множини, рахування",
      ord: 0,
    },
  ],
  themeConnections: [
    {
      id: 2,
      vertex_start: 1,
      vertex_finish: 2,
    },
  ],
  quizTasks: IMPORT_QUIZ_TASKS,
};

fs.writeFileSync(
  importOutputPath,
  `${JSON.stringify(importPayload, null, 2)}\n`,
  "utf8",
);

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

const reviewLines = [
  "# Quiz Tasks Content Review",
  "",
  `Generated: ${OUTPUT_DATE}`,
  "",
  `Total tasks: ${IMPORT_QUIZ_TASKS.length}`,
  "",
];

for (const theme of THEMES) {
  const tasks = IMPORT_QUIZ_TASKS.filter((task) => task.theme_id === theme.id);

  reviewLines.push(
    `## Theme ${theme.id}: ${theme.name}`,
    "",
    `Tasks: ${tasks.length}`,
    "",
    "| ID | Question | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Correct | Difficulty | Comment |",
    "| ---: | --- | --- | --- | --- | --- | ---: | ---: | --- |",
  );

  for (const task of tasks) {
    reviewLines.push(
      `| ${task.id} | ${escapeMarkdown(task.task_text)} | ${escapeMarkdown(task.answer_1)} | ${escapeMarkdown(task.answer_2)} | ${escapeMarkdown(task.answer_3)} | ${escapeMarkdown(task.answer_4)} | ${task.right_answer_n} | ${task.difficulty} | ${escapeMarkdown(task.comments)} |`,
    );
  }

  reviewLines.push("");
}

fs.mkdirSync(path.dirname(importOutputPath), {
  recursive: true,
});

fs.mkdirSync(path.dirname(reviewOutputPath), {
  recursive: true,
});

fs.writeFileSync(reviewOutputPath, `${reviewLines.join("\n")}\n`, "utf8");

console.log(`Import JSON: ${importOutputPath}`);
console.log(`Review Markdown: ${reviewOutputPath}`);
