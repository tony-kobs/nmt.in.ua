# Фіксований, не ковзний термін дії сесії — 24 години

**Статус:** зроблено (код), міграція **не застосована** — чекає ручного прогону.
**Гілка:** `feat/session-24h-expiration`

Не плутати з [`task-3.5-session-timer.md`](./task-3.5-session-timer.md) — той документ про
відлік *часу проходження* (`time`/`start_time`, «Час: MM:SS» у тренажері). Ця
задача про *дедлайн існування* рядка — коли сесія і сама автентифікована
сесія користувача стають недоступними, незалежно від того, скільки часу
пройшло в тренажері.

## Проблема

1. **Cookie `nmt_session` ковзала.** `sessionToken.ts` правильно ставив
   `exp = now + 86400` і відхиляв `exp <= now`. Але
   `getCurrentUser.ts:setSessionCookie` завжди видавав **новий** `exp`, а
   `upgradeSessionCookieAction`, `uploadAvatarAction`, `removeAvatarAction`
   викликали саме його при кожному оновленні профільних полів у cookie
   (legacy-upgrade, зміна аватара). Учень, який раз на день змінює фото,
   ніколи не вилогінювався — сесія фактично не мала терміну дії.
2. **`task_sessions` не мав дедлайна взагалі.** Незавершений/запланований
   рядок міг лишатись «активним» вічно.

## Рішення

### Auth: розділено видачу і оновлення cookie

- `setSessionCookie(user)` — без змін, завжди свіжий `exp = now + 86400`.
  Лишається лише для `loginAction`/`registerAction`/`demoLoginAction`.
- **Новий** `renewSessionCookie(user)` (`getCurrentUser.ts`) — читає `exp` з
  уже підписаного й перевіреного поточного payload (`getSessionPayload`,
  який сам відхиляє протермінований/невалідний токен), переносить його як є
  в новий токен (`createRenewedSessionToken`, `sessionToken.ts`), і ставить
  cookie з `maxAge = exp - now` (залишок, не нові 24 години). Повертає
  `false`, нічого не пишучи, якщо валідного payload немає — обновлення
  ніколи не рятує протерміновану сесію новим виданням.
- `upgradeSessionCookieAction`, `uploadAvatarAction`, `removeAvatarAction`
  тепер викликають `renewSessionCookie`, не `setSessionCookie`.

**Правило на майбутнє:** будь-яка дія, що лише оновлює поля профілю в
cookie (не логін), має використовувати `renewSessionCookie`. Використання
`setSessionCookie` поза трьома дозволеними місцями — регресія цієї задачі.

### `task_sessions.expire_time`

- Нова колонка `expire_time` (`INT UNSIGNED`, unix-секунди — той самий
  формат, що й `start_time`/`time`). Міграція:
  [`scripts/sql/016_task_sessions_expire_time.sql`](../scripts/sql/016_task_sessions_expire_time.sql)
  (**не застосована**, читайте PRE-FLIGHT у файлі перед прогоном).
- Спільна політика — `src/modules/testing/sessionExpiry.ts`:
  `SESSION_LIFETIME_SEC = 86400`, `computeSessionDeadline(nowSec)`,
  `isSessionExpired(deadline, nowSec)` (fail-closed: відсутній/нульовий
  дедлайн = протерміновано).
- **Ставиться рівно раз, при створенні рядка**, і ніколи не оновлюється:
  `startTopicTest`, `startNmtSimulator`, `startDiagnosticTest`,
  `createMentorSession`, `persistRecommendations` (заплановані авто-сесії).
  Активація запланованої сесії (`startPlannedSession`) і позначка старту
  (`markSessionStarted`/`markDiagnosticSessionStarted`) дедлайн **не
  чіпають** — заплановий рядок згорає за 24 години від створення, а не від
  моменту, коли учень нарешті його відкрив.
- **Правило гарду**, застосоване однаково в `src/modules/testing/*` і
  `src/modules/diagnostic/*`: після існуючого ownership-scoped
  `SELECT ... FOR UPDATE` —
  - `session_status === COMPLETED` → без змін, результат читається завжди,
    незалежно від `expire_time` (завершені результати зберігаються назавжди);
  - інакше, якщо `isSessionExpired(expire_time, now)` → відмова з новим
    кодом помилки `session_expired` (домен) / `sessionExpired` (Server
    Action), сесія **не автозавершується** — просто більше не приймає
    взаємодії;
  - інакше — існуюча логіка без змін.
  - Ідемпотентні «вже є значення, повернути як є» гілки (наприклад
    `checkAnswer`'s «вже відповіли») лишаються *до* перевірки дедлайна — це
    читання вже записаних даних, а не нова взаємодія.
- Файли з гардом: `getSessionTasks`, `startPlannedSession`,
  `markSessionStarted`, `checkAnswer`, `skipTaskAnswer`,
  `finishTrainerSession`, `getTaskHint`, `addSimilarPracticeTask` (+
  паралельно закрито прогалину: «Схоже завдання» тепер explicit блокує
  завершені сесії, чого раніше не було), і діагностичні аналоги
  `getDiagnosticSessionTasks`, `markDiagnosticSessionStarted`,
  `checkDiagnosticAnswer`, `finishDiagnosticSession`.
- `diagnostic/claimGuestProgress.ts` — без функціональних змін: `UPDATE`
  чіпає лише `user_id`/`guest_token`, `expire_time` виживає claim
  незмінним (тест на це є).
- `diagnostic/diagnosticThemeBreakdown.ts` — переглянуто, без змін: read-only,
  owner-scoped, і викликається лише після `summary` (тобто після
  завершення) — не може віддати дані активної протермінованої сесії.
- `results/getTopicResults.ts` — незавершені протерміновані спроби
  виключаються з вибірки **до** віконного ліміту (12 на тему), щоб не
  займали слот замість живих/завершених спроб.
- `sessions/getLearningSessions.ts` + `sessions/types.ts` — третій статус
  списку сесій `"expired"` (поруч із `"completed"`/`"planned"`).

### Фронтенд

- `TopicTrainer`/`NmtTrainer` вже мають типізовані коди помилок Server
  Action (`errors.<action>.<code>` / `errors.<code>`) — новий код
  `sessionExpired` додано в усі відповідні union-и й ключі `uk`/`en`/`de`
  без переробки UI.
- `getSessionTasks`/`getDiagnosticSessionTasks` читаються прямо зі сторінки
  (не через Server Action) — там новий гілка на `session_expired` рендерить
  `SessionExpiredNotice` замість `notFound()`.
- `useSessionTimer`/`useCountdownTimer` тепер повертають ще й `expired`
  (сесія протермінувалась щойно під час монтування) — `TopicTrainer`
  показує той самий `SessionExpiredNotice` замість тренажера. Ніяких нових
  клієнтських polling-циклів — просто реакція на вже існуючий
  `markSessionStarted` при монтуванні.

## Міграція — розгортання

1. **PRE-FLIGHT:** `SHOW CREATE TABLE task_sessions;` на реальній БД,
   перевірити пункт про можливу справжню колонку створення рядка.
2. Прогнати `scripts/sql/016_task_sessions_expire_time.sql` на проді
   **до** мерджу/деплою коду цієї задачі (інакше `INSERT` впаде на
   невідомій колонці; у зворотному порядку старий код просто ігнорує нову
   колонку).
3. **Наслідок дефолтного шляху (немає надійної колонки створення):** усі
   вже існуючі незавершені/заплановані рядки стають протермінованими
   одразу в момент прогону скрипта — без грейс-періоду. Дані не
   видаляються, лише більше не активні. Задокументовано в самому SQL-файлі.

## Що не в цій задачі

- Не переробляв UI тренажера/дизайн — лише додав одне повідомлення й один
  статус за наявним паттерном.
- Не чіпав таймер проходження тесту (`task-3.5-session-timer.md`) і
  Ultimate/НМТ countdown — це окремі, вже існуючі механізми в межах одної
  сесії; 24-годинний дедлайн — над ними, а не замість них.
- Не застосовував SQL-міграцію і не деплоїв.
