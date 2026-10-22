# Міграції схеми

Джерело правди — файли в `scripts/sql/`, за алфавітом імені. Журнал застосованих версій — таблиця `schema_migrations` (`version` = ім’я файлу, `applied_at`).

## Команда

```bash
npm run migrate
node scripts/migrate.mjs --check
```

`node scripts/migrate.mjs --check` лише перевіряє, що `mysql2` і `scripts/sql/` відкриваються, і виходить. Базу не чіпає і значення змінних не друкує.

Скрипт `scripts/migrate.mjs` читає `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` з оточення, інакше з `.env.production`, інакше з `.env.local` (вже задані змінні не перезаписує). Бере `GET_LOCK('nmt_schema')`, застосовує кожен ще не записаний файл, після успіху всього файлу пише версію.

Файл ріжеться на statements з урахуванням лапок (`'`, `"`, `` ` ``), `\'` / подвоєних лапок, коментарів `--` / `#` / `/* */` і директиви `DELIMITER`. Крапка з комою всередині рядка не закінчує statement. Версія пишеться лише після успіху всіх statements файлу, тож зірваний файл виконується знову, а вже записаний — ні.

Повторний запуск нічого не змінює: записаний файл пропускається. Окремий statement, який впирається в уже існуючу таблицю, колонку, індекс або дубль ключа (errno 1050, 1060, 1061, 1022, 1826, 1062, 1091), пропускається. Інша помилка зупиняє файл, версію не записує, деплой не міняє `www`.

Не обгортати файли в транзакцію: DDL у MySQL комітить сам.

## Деплой

`.github/workflows/deploy-hosting.yml` викликає `scripts/deploy-hosting.sh`. На хості, у каталозі нового релізу, після `npm install` і **до** зупинки Node і `mv` у `www` виконується `npm run migrate`. Помилка міграції залишає живий сайт на попередньому релізі.

У tar входять `scripts/migrate.mjs`, `scripts/migrate-sql.mjs` і `scripts/sql/`. Якщо їх немає в архіві, вивантаження не починається. `mysql2` — production-залежність: на хості її дає копія `node_modules` живого сайту і `npm install --omit=dev`. Скрипт `dotenv` не імпортує. Немає `scripts/migrate.mjs`, `scripts/sql` або `node_modules/mysql2` — staging стирається, `www` лишається попереднім.

Порожня база цей набір не підніме: старі `ALTER` (наприклад `quiz_tasks`, `themes`) розраховані на вже наявні таблиці контенту. Ціль — поточна база хостингу. Не ігнорувати errno 1146: інакше пропущений `ALTER` записався б як застосований.

## `ensure*` у запиті

`src/lib/db/schemaGuard.ts`: кожен `ensure*Schema` один раз на процес дивиться, чи всі його версії є в `schema_migrations`. Якщо так — DDL не виконується. Якщо ні — `GET_LOCK('nmt_schema', 15)` і стара ідемпотентна міграція. Вкладений `ensure*` не бере другий лок (інакше глухий кут на другому з’єднанні). Зайнятий лок — помилка, а не тихий пропуск.

Після першого успішного `npm run migrate` на проді запити більше не роблять `CREATE` / `ALTER`.

## Номери, яких бракувало в `scripts/sql`

| Файл | Що збігається з кодом |
| --- | --- |
| `002_legacy_content_tables.sql` | Порожній маркер: `themes`, `quiz_tasks`, `task_sessions` старші за репозиторій |
| `024_user_notifications.sql` | `src/modules/notifications/schema.ts` |
| `025_teacher_profile_fields.sql` | колонки візитки з `ensureTeacherProfileSchema` |
| `037_telegram_task_notifications.sql` | журнал задач Telegram |
| `040_daily_marathon.sql` | повна форма `dailySchema.ts`, включно з прапорцем опису |
| `045_cabinet_scope_full.sql` | `cabinet_scope = 'full'` для колишніх marathon-кабінетів |
| `048_account_deletion_grace.sql` | колонки відкладеного видалення на `app_users`. Перед продом — бекап бази |
| `049_marathon_button_labels.sql` | старі підписи кнопок бота. Перед продом — бекап бази |
| `051_support_tickets.sql` | `support_tickets`, `support_waits`, `marathons.public_chat_url`. Перед продом — бекап бази. `050` лишається за відкритим PR хронометра cron |

Два файли з префіксом `044` — різні версії: `044_notification_channels_and_invites.sql` і `044_user_sessions.sql`. Ключ журналу — повне ім’я файлу.
