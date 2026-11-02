-- Task 6.9 Stage 2 — five new interactive task formats: assemble-the-solution
-- ("Збери розв'язання"), find-the-error ("Знайди помилку"), interactive graph
-- point-picking, matching, and fill-in-the-blanks with per-blank checking.
--
-- Architecture decision (documented here, not just in code comments):
-- these formats do NOT reuse `tasks2session`/`task_sessions` — that
-- polymorphic pair is tightly coupled to the MCQ/open-answer shape shared by
-- `quiz_tasks`/`nmt_quiz_tasks` (`checkAnswer.ts`'s `answerNumber`/
-- `answerText` contract), and each of these five formats has a genuinely
-- different submission shape (an ordered list of step ids, a line index +
-- correction choice, a set of point ids, a left→right pairing map, or a
-- per-blank text map) that doesn't fit that contract without heavily
-- overloading it. Per the explicit instruction not to introduce a new
-- `task_sessions.session_type` (1-5 are all taken), each format instead gets
-- its own small content schema, and all five SHARE one attempts table
-- (`practice_stage2_attempts`) that reimplements the same integrity rules
-- Stage 1 already established — logged-in user only, ownership by
-- `user_id`, `SELECT ... FOR UPDATE` idempotency, exactly one retry before
-- lock+reveal — without a `task_sessions` row backing it (these are
-- standalone Practice drills, not part of a timed/scored trainer session,
-- so the 24h session-expiry concept does not apply to them; see
-- `src/modules/stage2/stage2Attempt.ts`).
--
-- Every content table follows the same shape as `quiz_tasks`'s hint columns
-- (migration 026): `hint_direction`, `hint_rule` (first two hint-ladder
-- rungs, nullable) and `comments` (explanation / worked example, rung 3 —
-- also what's revealed after the one allowed retry is spent). No legacy rows
-- exist for any of these tables (they are new content only), so there is no
-- graceful-degradation concern for THIS migration — future imports that omit
-- `hint_direction`/`hint_rule` still degrade exactly like `quiz_tasks` does
-- today (see `getTaskHintLevel.ts`'s `resolveRung`, reused conceptually).
--
-- Run once in phpMyAdmin or: mysql ... < scripts/sql/028_stage2_task_formats.sql
-- `CREATE TABLE IF NOT EXISTS` throughout — safe to re-run for the DDL; the
-- seed INSERTs at the bottom use explicit ids and are also safe to re-run
-- (`INSERT IGNORE`).
--
-- NOTE: like 026/027, written and reviewed against this repo's schema
-- conventions but NOT executed against a live/production MySQL instance in
-- this environment (no local MySQL reachable). Validate on a staging copy first.
--
-- Content sourcing: every task below is original, internally authored
-- content — no external source was used (same standard as the existing
-- `quiz_tasks`/`nmt_quiz_tasks` bank, which also carries no citations).
-- Every numeric fact was verified by direct computation while writing this
-- file (shown inline in each `comments` explanation) rather than invented.

-- ===== Shared attempts table =====================================

CREATE TABLE IF NOT EXISTS practice_stage2_attempts (
  id INT NOT NULL AUTO_INCREMENT,
  format ENUM('order', 'find_error', 'graph', 'matching', 'blank') NOT NULL,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  -- Same convention as `tasks2session.status`: 0 unanswered, 1 correct, -1 incorrect.
  status SMALLINT NOT NULL DEFAULT 0,
  first_attempt_status SMALLINT NULL DEFAULT NULL,
  retry_used TINYINT(1) NOT NULL DEFAULT 0,
  hint_level_unlocked SMALLINT NOT NULL DEFAULT 0,
  -- The student's last submitted answer, as JSON (shape varies per format —
  -- e.g. an ordered id array for 'order', a `{ord: text}` map for 'blank').
  -- Written on every scored submission so a later idempotent re-read (page
  -- reload, second device) can deterministically RECOMPUTE any per-item
  -- breakdown (e.g. 'blank'’s per-blank correctness) from this stored
  -- submission plus the task's current stored answer key — never trusting
  -- client-supplied data on the re-read itself, only replaying what the
  -- server already scored. See `src/modules/stage2/blankTask.ts`.
  submitted_json TEXT NULL,
  created_at INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stage2_attempt (format, task_id, user_id),
  KEY idx_stage2_attempt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 1) Assemble-the-solution ("Збери розв'язання") =============

CREATE TABLE IF NOT EXISTS order_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  theme_id INT NULL,
  difficulty SMALLINT NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  task_text TEXT NOT NULL,
  hint_direction TEXT NULL,
  hint_rule TEXT NULL,
  comments TEXT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_task_steps (
  id INT NOT NULL AUTO_INCREMENT,
  order_task_id INT NOT NULL,
  correct_ord SMALLINT NOT NULL,
  step_text TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_task_steps_task (order_task_id),
  CONSTRAINT fk_order_task_steps_task
    FOREIGN KEY (order_task_id) REFERENCES order_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 2) Find-the-error ("Знайди помилку") ========================

CREATE TABLE IF NOT EXISTS find_error_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  theme_id INT NULL,
  difficulty SMALLINT NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  task_text TEXT NOT NULL,
  error_line_ord SMALLINT NOT NULL,
  -- Correction choices, same answer_1..4/right_answer_n convention as
  -- `quiz_tasks` — one of them is the shown (wrong) line repeated so picking
  -- "leave it as-is" is a real, checkable wrong choice, not just omitted.
  correction_1 TEXT NOT NULL,
  correction_2 TEXT NOT NULL,
  correction_3 TEXT NOT NULL,
  correction_4 TEXT NOT NULL,
  right_correction_n TINYINT NOT NULL,
  hint_direction TEXT NULL,
  hint_rule TEXT NULL,
  comments TEXT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS find_error_task_lines (
  id INT NOT NULL AUTO_INCREMENT,
  find_error_task_id INT NOT NULL,
  ord SMALLINT NOT NULL,
  line_text TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_find_error_lines_task (find_error_task_id),
  CONSTRAINT fk_find_error_lines_task
    FOREIGN KEY (find_error_task_id) REFERENCES find_error_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 3) Interactive graph point-picking ==========================

CREATE TABLE IF NOT EXISTS graph_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  theme_id INT NULL,
  difficulty SMALLINT NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  task_text TEXT NOT NULL,
  -- Axis range for the client to draw a fixed-size grid — never inferred
  -- from point coordinates (a legacy-safe default a future importer can omit).
  axis_min SMALLINT NOT NULL DEFAULT -5,
  axis_max SMALLINT NOT NULL DEFAULT 5,
  hint_direction TEXT NULL,
  hint_rule TEXT NULL,
  comments TEXT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS graph_task_points (
  id INT NOT NULL AUTO_INCREMENT,
  graph_task_id INT NOT NULL,
  label VARCHAR(8) NOT NULL,
  x DECIMAL(6,2) NOT NULL,
  y DECIMAL(6,2) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_graph_task_points_task (graph_task_id),
  CONSTRAINT fk_graph_task_points_task
    FOREIGN KEY (graph_task_id) REFERENCES graph_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 4) Matching ==================================================

CREATE TABLE IF NOT EXISTS matching_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  theme_id INT NULL,
  difficulty SMALLINT NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  task_text TEXT NOT NULL,
  hint_direction TEXT NULL,
  hint_rule TEXT NULL,
  comments TEXT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each row IS one correct pair — `id` doubles as both the left item's and
-- the (shuffled, client-side) right item's join key, so correctness is
-- "submitted right-side id for this row's left id === this row's id",
-- never a separately-stored answer key that could drift out of sync.
CREATE TABLE IF NOT EXISTS matching_task_pairs (
  id INT NOT NULL AUTO_INCREMENT,
  matching_task_id INT NOT NULL,
  left_text TEXT NOT NULL,
  right_text TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_matching_task_pairs_task (matching_task_id),
  CONSTRAINT fk_matching_task_pairs_task
    FOREIGN KEY (matching_task_id) REFERENCES matching_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 5) Fill-in-the-blanks (independent per-blank checking) =======

CREATE TABLE IF NOT EXISTS blank_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  theme_id INT NULL,
  difficulty SMALLINT NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  -- Contains `{{1}}`, `{{2}}`, ... placeholders — never the answers.
  task_text TEXT NOT NULL,
  hint_direction TEXT NULL,
  hint_rule TEXT NULL,
  comments TEXT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blank_task_blanks (
  id INT NOT NULL AUTO_INCREMENT,
  blank_task_id INT NOT NULL,
  ord SMALLINT NOT NULL,
  correct_text VARCHAR(255) NOT NULL,
  -- Comma-separated accepted alternatives (e.g. "0,3" AND "0.3") — matched
  -- after the same normalization `checkAnswer.ts` already uses for
  -- open-answer NMT tasks (trim/lowercase/strip spaces, comma→dot).
  accepted_alternatives VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_blank_task_blanks_task (blank_task_id),
  CONSTRAINT fk_blank_task_blanks_task
    FOREIGN KEY (blank_task_id) REFERENCES blank_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== Seed content (4 items each: 3 original + 1 same-topic variant) ====
-- Every computed fact below is verified by direct arithmetic in the
-- accompanying `comments` explanation.

-- --- order_tasks ---------------------------------------------------
INSERT IGNORE INTO order_tasks (id, theme_id, difficulty, name, task_text, hint_direction, hint_rule, comments) VALUES
(1, NULL, 1, 'Лінійне рівняння', 'Розташуйте кроки розв’язання рівняння $3x + 5 = 20$ у правильному порядку.',
  'Спочатку потрібно ізолювати доданок з $x$ — перенести число без $x$ в іншу частину рівняння.',
  'Перенесення доданка в іншу частину рівняння змінює його знак на протилежний; після цього обидві частини ділять на коефіцієнт при $x$.',
  '$3x+5=20 \\Rightarrow 3x=20-5 \\Rightarrow 3x=15 \\Rightarrow x=15:3 \\Rightarrow x=5$. Перевірка: $3\\cdot5+5=20$.'),
(2, NULL, 1, 'Рівняння з дужками', 'Розташуйте кроки розв’язання рівняння $2(x-3) = 10$ у правильному порядку.',
  'Спочатку розкрийте дужки, помноживши $2$ на кожен доданок усередині.',
  'Після розкриття дужок рівняння стає звичайним лінійним: перенесіть число в іншу частину і поділіть на коефіцієнт при $x$.',
  '$2(x-3)=10 \\Rightarrow 2x-6=10 \\Rightarrow 2x=16 \\Rightarrow x=8$. Перевірка: $2\\cdot(8-3)=2\\cdot5=10$.'),
(3, NULL, 2, 'Квадратне рівняння (розкладання)', 'Розташуйте кроки розв’язання рівняння $x^2-5x+6=0$ у правильному порядку.',
  'Спробуйте розкласти ліву частину на множники — знайдіть два числа з добутком $6$ і сумою $-5$.',
  'Якщо добуток двох дужок дорівнює нулю, то хоча б одна з них дорівнює нулю: розгляньте обидва випадки окремо.',
  '$x^2-5x+6=0 \\Rightarrow (x-2)(x-3)=0 \\Rightarrow x-2=0$ або $x-3=0 \\Rightarrow x=2$ або $x=3$. Перевірка: $2^2-5\\cdot2+6=0$, $3^2-5\\cdot3+6=0$.'),
(4, NULL, 1, 'Лінійне рівняння (варіант)', 'Розташуйте кроки розв’язання рівняння $4x - 7 = 9$ у правильному порядку.',
  'Спочатку потрібно ізолювати доданок з $x$ — перенести число без $x$ в іншу частину рівняння.',
  'Перенесення доданка в іншу частину рівняння змінює його знак на протилежний; після цього обидві частини ділять на коефіцієнт при $x$.',
  '$4x-7=9 \\Rightarrow 4x=9+7 \\Rightarrow 4x=16 \\Rightarrow x=16:4 \\Rightarrow x=4$. Перевірка: $4\\cdot4-7=9$.');

INSERT IGNORE INTO order_task_steps (order_task_id, correct_ord, step_text) VALUES
(1, 1, '$3x + 5 = 20$'), (1, 2, '$3x = 20 - 5$'), (1, 3, '$3x = 15$'), (1, 4, '$x = 15 : 3$'), (1, 5, '$x = 5$'),
(2, 1, '$2(x-3) = 10$'), (2, 2, '$2x - 6 = 10$'), (2, 3, '$2x = 16$'), (2, 4, '$x = 8$'),
(3, 1, '$x^2-5x+6=0$'), (3, 2, '$(x-2)(x-3)=0$'), (3, 3, '$x-2=0$ або $x-3=0$'), (3, 4, '$x=2$ або $x=3$'),
(4, 1, '$4x - 7 = 9$'), (4, 2, '$4x = 9 + 7$'), (4, 3, '$4x = 16$'), (4, 4, '$x = 16 : 4$'), (4, 5, '$x = 4$');

-- --- find_error_tasks ------------------------------------------------
INSERT IGNORE INTO find_error_tasks (id, theme_id, difficulty, name, task_text, error_line_ord, correction_1, correction_2, correction_3, correction_4, right_correction_n, hint_direction, hint_rule, comments) VALUES
(1, NULL, 2, 'Знак при перенесенні доданка', 'У розв’язанні рівняння $5x - 3 = 2x + 9$ є помилка. Знайдіть рядок з помилкою та виберіть правильний варіант цього рядка.',
  2, '$5x - 2x = 9 - 3$', '$5x - 2x = 9 + 3$', '$5x + 2x = 9 + 3$', '$5x - 2x = -9 + 3$', 2,
  'Перевірте, як саме доданки $-3$ і $2x$ перенесені в інші частини рівняння.',
  'При перенесенні доданка через знак рівності його знак змінюється на протилежний: $-3$ праворуч стає $+3$.',
  'Правильно: $5x-3=2x+9 \\Rightarrow 5x-2x=9+3 \\Rightarrow 3x=12 \\Rightarrow x=4$. Перевірка: $5\\cdot4-3=17=2\\cdot4+9$.'),
(2, NULL, 2, 'Квадрат суми', 'У розв’язанні виразу $(x+3)^2$ є помилка. Знайдіть рядок з помилкою та виберіть правильний варіант цього рядка.',
  2, '$x^2 + 9$', '$x^2 + 6x + 9$', '$x^2 + 3x + 9$', '$x^2 + 6x + 6$', 2,
  'Квадрат суми — це не сума квадратів; згадайте формулу $(a+b)^2$.',
  'Формула квадрата суми: $(a+b)^2 = a^2 + 2ab + b^2$. Тут $a=x$, $b=3$, тому середній доданок дорівнює $2\\cdot x\\cdot3=6x$.',
  'Правильно: $(x+3)^2 = x^2+6x+9$. Пропуск середнього доданка $2ab$ — поширена помилка.'),
(3, NULL, 2, 'Відсоткові зміни', 'У розв’язанні задачі про ціну товару є помилка. Знайдіть рядок з помилкою та виберіть правильний варіант цього рядка. (Ціну $100$ грн спочатку знизили на $20\\%$, потім підвищили на $20\\%$.)',
  3, '$80 + 20 = 100$', '$80 + 0{,}2\\cdot80 = 96$', '$80 + 0{,}2\\cdot100 = 100$', '$80 - 0{,}2\\cdot80 = 64$', 2,
  'Відсоток підвищення після знижки рахується від НОВОЇ ціни, а не від початкової.',
  'Якщо ціну $100$ грн знизили на $20\\%$, вона стала $80$ грн. Підвищення на $20\\%$ рахується від $80$, а не від $100$: $80+0{,}2\\cdot80=96$.',
  'Правильно: кінцева ціна $96$ грн, а не $100$ — послідовні відсоткові зміни в різні боки на однакове число НЕ компенсують одна одну.'),
(4, NULL, 2, 'Знак при перенесенні доданка (варіант)', 'У розв’язанні рівняння $4x - 5 = x + 10$ є помилка. Знайдіть рядок з помилкою та виберіть правильний варіант цього рядка.',
  2, '$4x - x = 10 - 5$', '$4x - x = 10 + 5$', '$4x + x = 10 + 5$', '$4x - x = -10 + 5$', 2,
  'Перевірте, як саме доданки $-5$ і $x$ перенесені в інші частини рівняння.',
  'При перенесенні доданка через знак рівності його знак змінюється на протилежний: $-5$ ліворуч стає $+5$ праворуч.',
  'Правильно: $4x-5=x+10 \\Rightarrow 4x-x=10+5 \\Rightarrow 3x=15 \\Rightarrow x=5$. Перевірка: $4\\cdot5-5=15=5+10$.');

INSERT IGNORE INTO find_error_task_lines (find_error_task_id, ord, line_text) VALUES
(1, 1, '$5x - 3 = 2x + 9$'), (1, 2, '$5x - 2x = 9 - 3$'), (1, 3, '$3x = 6$'), (1, 4, '$x = 2$'),
(2, 1, '$(x+3)^2$'), (2, 2, '$= x^2 + 9$'),
(3, 1, 'Нехай початкова ціна $= 100$ грн.'), (3, 2, 'Після зниження на $20\\%$: $100-20=80$ грн.'), (3, 3, 'Після підвищення на $20\\%$: $80+20=100$ грн.'), (3, 4, 'Кінцева ціна дорівнює початковій.'),
(4, 1, '$4x - 5 = x + 10$'), (4, 2, '$4x - x = 10 - 5$'), (4, 3, '$3x = 5$'), (4, 4, '$x = 5/3$');

-- --- graph_tasks -----------------------------------------------------
INSERT IGNORE INTO graph_tasks (id, theme_id, difficulty, name, task_text, axis_min, axis_max, hint_direction, hint_rule, comments) VALUES
(1, NULL, 1, 'Точки на прямій', 'Позначені точки. Виберіть усі точки, що лежать на графіку функції $y = 2x - 1$.', -5, 5,
  'Підставте координату $x$ кожної точки у формулу функції та обчисліть очікуване значення $y$.',
  'Точка $(x_0, y_0)$ лежить на графіку функції $y=f(x)$ тоді й лише тоді, коли $y_0 = f(x_0)$.',
  'Перевірка: $A(0,-1)$: $2\\cdot0-1=-1$ ✓. $B(1,1)$: $2\\cdot1-1=1$ ✓. $C(2,2)$: $2\\cdot2-1=3\\ne2$ ✗. $D(-1,-3)$: $2\\cdot(-1)-1=-3$ ✓. $E(3,4)$: $2\\cdot3-1=5\\ne4$ ✗.'),
(2, NULL, 2, 'Точки на параболі', 'Позначені точки. Виберіть усі точки, що лежать на графіку функції $y = x^2$.', -5, 10,
  'Підставте координату $x$ кожної точки у формулу функції та обчисліть очікуване значення $y$.',
  'Точка $(x_0, y_0)$ лежить на графіку функції $y=f(x)$ тоді й лише тоді, коли $y_0 = f(x_0)$.',
  'Перевірка: $A(1,1)$: $1^2=1$ ✓. $B(2,4)$: $2^2=4$ ✓. $C(-2,4)$: $(-2)^2=4$ ✓. $D(3,8)$: $3^2=9\\ne8$ ✗. $E(0,1)$: $0^2=0\\ne1$ ✗.'),
(3, NULL, 2, 'Корені квадратного рівняння', 'На числовій прямій позначені точки. Виберіть точки, що є коренями рівняння $x^2-5x+6=0$.', 0, 7,
  'Розкладіть квадратний тричлен на множники та знайдіть, при яких $x$ добуток дорівнює нулю.',
  'Корені рівняння $x^2-5x+6=0$ — це значення $x$, для яких $(x-2)(x-3)=0$.',
  'Розкладання: $x^2-5x+6=(x-2)(x-3)$. Корені: $x=2$ і $x=3$. Точки $x=1,4,6$ коренями не є.'),
(4, NULL, 1, 'Точки на прямій (варіант)', 'Позначені точки. Виберіть усі точки, що лежать на графіку функції $y = -x + 2$.', -5, 5,
  'Підставте координату $x$ кожної точки у формулу функції та обчисліть очікуване значення $y$.',
  'Точка $(x_0, y_0)$ лежить на графіку функції $y=f(x)$ тоді й лише тоді, коли $y_0 = f(x_0)$.',
  'Перевірка: $A(0,2)$: $-0+2=2$ ✓. $B(1,1)$: $-1+2=1$ ✓. $C(2,1)$: $-2+2=0\\ne1$ ✗. $D(-1,3)$: $1+2=3$ ✓. $E(3,0)$: $-3+2=-1\\ne0$ ✗.');

INSERT IGNORE INTO graph_task_points (graph_task_id, label, x, y, is_correct) VALUES
(1, 'A', 0, -1, 1), (1, 'B', 1, 1, 1), (1, 'C', 2, 2, 0), (1, 'D', -1, -3, 1), (1, 'E', 3, 4, 0),
(2, 'A', 1, 1, 1), (2, 'B', 2, 4, 1), (2, 'C', -2, 4, 1), (2, 'D', 3, 8, 0), (2, 'E', 0, 1, 0),
(3, 'A', 1, 0, 0), (3, 'B', 2, 0, 1), (3, 'C', 3, 0, 1), (3, 'D', 4, 0, 0), (3, 'E', 6, 0, 0),
(4, 'A', 0, 2, 1), (4, 'B', 1, 1, 1), (4, 'C', 2, 1, 0), (4, 'D', -1, 3, 1), (4, 'E', 3, 0, 0);

-- --- matching_tasks ---------------------------------------------------
INSERT IGNORE INTO matching_tasks (id, theme_id, difficulty, name, task_text, hint_direction, hint_rule, comments) VALUES
(1, NULL, 2, 'Розкладання на множники', 'Установіть відповідність між виразом і його розкладанням на множники.',
  'Спробуйте впізнати формулу скороченого множення в кожному виразі: різниця квадратів чи квадрат суми/різниці.',
  'Різниця квадратів: $a^2-b^2=(a-b)(a+b)$. Квадрат суми: $a^2+2ab+b^2=(a+b)^2$. Квадрат різниці: $a^2-2ab+b^2=(a-b)^2$.',
  '$x^2-9=(x-3)(x+3)$; $x^2+6x+9=(x+3)^2$; $x^2-4x+4=(x-2)^2$.'),
(2, NULL, 1, 'Кути', 'Установіть відповідність між описом кута та його величиною.',
  'Згадайте суму кутів трикутника й чотирикутника, а також означення суміжних і вертикальних кутів.',
  'Сума суміжних кутів дорівнює $180^\\circ$; вертикальні кути рівні між собою.',
  'Сума кутів трикутника — $180^\\circ$; сума кутів чотирикутника — $360^\\circ$; суміжний із $70^\\circ$ — $180^\\circ-70^\\circ=110^\\circ$; вертикальний із $50^\\circ$ — $50^\\circ$.'),
(3, NULL, 1, 'Відсоткові зміни', 'Установіть відповідність між відсотковою зміною та відповідним множником.',
  'Збільшення на $p\\%$ — це множення на $\\left(1+\\frac{p}{100}\\right)$, а зменшення — на $\\left(1-\\frac{p}{100}\\right)$.',
  'Множник дорівнює $1 \\pm \\frac{p}{100}$ залежно від напрямку зміни.',
  'Збільшення на $25\\%$ → $\\times1{,}25$; зменшення на $25\\%$ → $\\times0{,}75$; збільшення на $50\\%$ → $\\times1{,}5$; зменшення на $10\\%$ → $\\times0{,}9$.'),
(4, NULL, 2, 'Розкладання на множники (варіант)', 'Установіть відповідність між виразом і його розкладанням на множники.',
  'Спробуйте впізнати формулу скороченого множення в кожному виразі: різниця квадратів чи квадрат суми.',
  'Різниця квадратів: $a^2-b^2=(a-b)(a+b)$. Квадрат суми: $a^2+2ab+b^2=(a+b)^2$. Квадрат різниці: $a^2-2ab+b^2=(a-b)^2$.',
  '$x^2-16=(x-4)(x+4)$; $x^2+8x+16=(x+4)^2$; $x^2-10x+25=(x-5)^2$.');

INSERT IGNORE INTO matching_task_pairs (matching_task_id, left_text, right_text) VALUES
(1, '$x^2-9$', '$(x-3)(x+3)$'), (1, '$x^2+6x+9$', '$(x+3)^2$'), (1, '$x^2-4x+4$', '$(x-2)^2$'),
(2, 'Сума кутів трикутника', '$180^\\circ$'), (2, 'Сума кутів чотирикутника', '$360^\\circ$'), (2, 'Кут, суміжний із кутом $70^\\circ$', '$110^\\circ$'), (2, 'Кут, вертикальний із кутом $50^\\circ$', '$50^\\circ$'),
(3, 'Збільшення на $25\\%$', '$\\times1{,}25$'), (3, 'Зменшення на $25\\%$', '$\\times0{,}75$'), (3, 'Збільшення на $50\\%$', '$\\times1{,}5$'), (3, 'Зменшення на $10\\%$', '$\\times0{,}9$'),
(4, '$x^2-16$', '$(x-4)(x+4)$'), (4, '$x^2+8x+16$', '$(x+4)^2$'), (4, '$x^2-10x+25$', '$(x-5)^2$');

-- --- blank_tasks -------------------------------------------------------
INSERT IGNORE INTO blank_tasks (id, theme_id, difficulty, name, task_text, hint_direction, hint_rule, comments) VALUES
(1, NULL, 1, 'Лінійне рівняння з пропусками', 'Розв’яжіть рівняння $2x+6=14$: $2x = 14 - \\{\\{1\\}\\} = \\{\\{2\\}\\}$. $x = \\{\\{2\\}\\} : 2 = \\{\\{3\\}\\}$.',
  'Перенесіть число без $x$ в іншу частину рівняння, потім поділіть на коефіцієнт при $x$.',
  'Перенесення доданка змінює його знак на протилежний; ділення обох частин на однакове ненульове число зберігає рівність.',
  '$2x+6=14 \\Rightarrow 2x=14-6=8 \\Rightarrow x=8:2=4$. Перевірка: $2\\cdot4+6=14$.'),
(2, NULL, 1, 'Відсотки з пропусками', 'Знайдіть $30\\%$ від числа $250$: $250 \\cdot \\{\\{1\\}\\} = \\{\\{2\\}\\}$.',
  '$p\\%$ від числа записується як десятковий дріб і множиться на це число.',
  '$p\\%=\\frac{p}{100}$, тому "$30\\%$ від $250$" $=250\\cdot0{,}3$.',
  '$250\\cdot0{,}3=75$.'),
(3, NULL, 3, 'Дискримінант з пропусками', 'Дискримінант рівняння $x^2-4x+3=0$: $D=b^2-4ac=(-4)^2-4\\cdot1\\cdot\\{\\{1\\}\\}=\\{\\{2\\}\\}$. Корені: $x=\\frac{4\\pm\\{\\{3\\}\\}}{2}$, більший корінь $x_1=\\{\\{4\\}\\}$, менший корінь $x_2=\\{\\{5\\}\\}$.',
  'Спочатку визначте коефіцієнти $a$, $b$, $c$ рівняння, потім обчисліть $D=b^2-4ac$.',
  'Формула коренів: $x=\\frac{-b\\pm\\sqrt{D}}{2a}$. Тут $a=1$, $b=-4$, $c=3$.',
  '$D=(-4)^2-4\\cdot1\\cdot3=16-12=4$, $\\sqrt{D}=2$. $x=\\frac{4\\pm2}{2}$, тобто $x_1=3$, $x_2=1$.'),
(4, NULL, 1, 'Лінійне рівняння з пропусками (варіант)', 'Розв’яжіть рівняння $3x-4=11$: $3x = 11 + \\{\\{1\\}\\} = \\{\\{2\\}\\}$. $x = \\{\\{2\\}\\} : 3 = \\{\\{3\\}\\}$.',
  'Перенесіть число без $x$ в іншу частину рівняння, потім поділіть на коефіцієнт при $x$.',
  'Перенесення доданка змінює його знак на протилежний; ділення обох частин на однакове ненульове число зберігає рівність.',
  '$3x-4=11 \\Rightarrow 3x=11+4=15 \\Rightarrow x=15:3=5$. Перевірка: $3\\cdot5-4=11$.');

INSERT IGNORE INTO blank_task_blanks (blank_task_id, ord, correct_text, accepted_alternatives) VALUES
(1, 1, '6', NULL), (1, 2, '8', NULL), (1, 3, '4', NULL),
(2, 1, '0,3', '0.3'), (2, 2, '75', NULL),
(3, 1, '3', NULL), (3, 2, '4', NULL), (3, 3, '2', NULL), (3, 4, '3', NULL), (3, 5, '1', NULL),
(4, 1, '4', NULL), (4, 2, '15', NULL), (4, 3, '5', NULL);
