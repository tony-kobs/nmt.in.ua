# nmt.in.ua

Сайт [nmt.in.ua](https://nmt.in.ua) на Next.js 16 (App Router, TypeScript). Стилі — CSS Modules.

## Як почати

Потрібні Node.js 20+ і npm.

```bash
git clone https://github.com/tony-kobs/nmt.in.ua.git
cd nmt.in.ua
git checkout dev
npm install
cp .env.example .env.local
# заповни DB_* та секрети (див. розділ «Змінні середовища»)
npm run dev
```

Локально сайт відкриється на [http://localhost:3000](http://localhost:3000).

Код сторінок лежить у `src/app/`. Після змін сторінка оновлюється сама.

## Команди

| Команда | Що робить |
| --- | --- |
| `npm run dev` | локальна розробка |
| `npm run build` | продакшен-збірка (Webpack) |
| `npm start` | запуск зібраного сайту через `server.js` |
| `npm test` | unit-тести (192 кейси) |
| `npm run lint` | перевірка ESLint |
| `npm run reset-demo-student` | скинути сесії/результати demo-student (`user_id=1`) |

## Що вже працює end-to-end

| Область | Статус |
| --- | --- |
| Дашборд | Header, Sidebar, SEO, `RecentResults` у sidebar |
| Імпорт контенту | `POST /api/import` + форма на `/settings` |
| Тест за темою | `/` → `/session/[id]` — звичайний (10 завдань) і **Ultimate** (20 завдань, 20 хв) |
| Результати | `/results` — таблиця прогресу + рекомендації |
| Сесії | `/sessions` — історія, auto-сесії, mentor-сесії (Старт/×) |
| Рекомендації | після finish, на `/results`, при reopen завершеної сесії |
| Граф тем | `theme_connections` → наступна тема в рекомендаціях |
| Mentor API | `POST /api/admin/sessions` — planned-сесія від ментора |
| Auth | `/` вітальна (гость), `/login`, `/register`, ролі, демо-акаунти |

**Заглушки (скоро):** `/problems`, `/materials`, `/consultations`.

## Змінні середовища

Скопіюй `.env.example` → `.env.local` (локально) або `.env.production` (хостинг). Секрети не комітити.

| Змінна | Призначення |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL |
| `DB_CONNECTION_LIMIT`, `DB_CONNECT_TIMEOUT_MS`, `DB_MAX_IDLE`, `DB_IDLE_TIMEOUT_MS` | тюнінг пулу; `DB_IDLE_TIMEOUT_MS` тримати нижче `wait_timeout` сервера |
| `NEXT_PUBLIC_SITE_URL` | canonical URL для SEO |
| `CONTENT_IMPORT_API_KEY` | Bearer для `POST /api/import` і Server Action імпорту (admin) |
| `ADMIN_API_KEY` | Bearer для `POST /api/admin/sessions` |
| `SESSION_SECRET` | HMAC-секрет для cookie `nmt_session` (обовʼязково в production) |
| `MAX_BODY_BYTES` | ліміт тіла HTTP на `server.js` (дефолт 8388608) |

Якщо `CONTENT_IMPORT_API_KEY` або `ADMIN_API_KEY` не задані — відповідні ендпоінти відхиляють **усі** запити (`401`, fail-closed).

### Демо-облікові записи

Після першого входу таблиця `app_users` створюється автоматично (legacy `users` на хостингу не чіпаємо). Для перевірки:

| Логін | Пароль | Роль | Можливості |
| --- | --- | --- | --- |
| `demo-student` | `demo123` | Учень | тести, результати, власні сесії |
| `demo-teacher` | `demo123` | Викладач | + призначення mentor-сесій на `/sessions` |
| `demo-admin` | `demo123` | Адмін | + імпорт контенту на `/settings` |

На `/login` є кнопки швидкого входу для кожної ролі. Нові учні реєструються на `/register` (роль `student`, авто-вхід після створення).

**Скидання демо-даних:** старі тести до auth писалися з `user_id=1`, тому вони «прилипають» до demo-student. Очистити:

```bash
npm run reset-demo-student
```

Або SQL: `scripts/sql/002_reset_demo_student.sql`.

## Auth (модуль 5)

| Що | Де |
| --- | --- |
| Вхід / вихід | `/login`, cookie `nmt_session` |
| Реєстрація | `/register` — публічна, лише роль `student` |
| Ролі | `student`, `teacher`, `admin` |
| Облікові записи | таблиця `app_users` (окремо від legacy `users` на хостингу) |
| Middleware | редірект на `/login`; публічні `/`, `/welcome`, `/login`, `/register` і статика з `public/`; `/settings` — лише admin |
| Mentor UI | `/sessions` — панель призначення для teacher/admin |

`userId` у Server Actions береться з сесії (`requireUserId()`), не з FormData.

---

Нові компоненти стилізуйте через CSS Modules:

```tsx
import styles from "./page.module.css";

<div className={styles.page}>...</div>
```

Глобальний reset і дизайн-токени — у `src/app/globals.css`. Tailwind не використовуємо.

Спільні UI-примітиви: `PageFrame`, `ModeTabs`, `Reveal` у `src/components/dashboard/` та `src/components/ui/`.

## Дизайн-система

Правила верстки — `.cursor/rules/design-system.mdc` (читати перед будь-якою версткою; оновлювати після кожної секції).

- **Mobile-first**, брейкпоінти `375 / 768 / 1240 / 1440 / 1920`, тільки `min-width`-медіа.
- Між брейкпоінтами все гумове через `clamp()`: типографіка (`--fs-*`), ритм (`--space-*`,
  `--section-y`, `--container-pad`), контейнер (`--container-max`).
- Кольори, радіуси, тіні, градієнти (`--grad-brand`, `--grad-aurora`, `--grad-glass`, `--grad-ink`, `--grad-ultimate`)
  беруться з `:root`; локальних дублікатів не заводимо.
- Палітра — теплий «старий зошит»: фон `--page #efe8d7`, поверхні `--surface #fdfbf4`.
  Чистий `#fff` не використовуємо.
- Публічний лендінг: `src/components/welcome/*` — секції `LandingHeader`, `Hero`, `Features`,
  `Steps`, `Faq`, `CtaBanner`, `LandingFooter`; спільні стилі — `welcome/landing.module.css`.
- Кабінет після входу: `src/components/dashboard/*` — той самий візуал (`DashboardShell`,
  `AppHeader`, `AppSidebar`, `PageFrame`, домашня `TopicTestStart`).
- Сторінки `/login` і `/register` — спільний каркас `components/auth/AuthShell` + `auth.module.css`.
- Scroll-reveal — `components/ui/Reveal` на IntersectionObserver, без зовнішніх бібліотек;
  вимикається через `prefers-reduced-motion`.

## Гілки

Працюйте тільки з `dev`. У `main` напряму пушити не можна.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/коротка-назва
```

Після роботи — commit, push, PR `feature/...` → `dev`. Реліз: `dev` → `main`. Merge в `main` одразу деплоїть хостинг.

## Деплой

Повна памʼятка: [`docs/deploy.md`](docs/deploy.md).

| Середовище | Як оновлюється |
| --- | --- |
| **nmt.in.ua (ukraine.com.ua)** | merge в `main` → GitHub Actions збирає → хостинг лише міняє `www` |
| **Vercel** | теж з `main`, окремо; домен дивиться на хостинг, не сюди |

На хості Next **не збираємо** (glibc 2.28). Старий кореневий `deploy.sh` прибрано.

Що робить CI (`.github/workflows/deploy-hosting.yml`):

1. `npm ci` / test / lint / `npm run build` на Ubuntu, Node 24.
2. `scripts/rewrite-next-build-paths.sh` — інакше RSC-маніфест тримає `/home/runner/work/...` і сайт дає 500.
3. Tar (весь `src/`, без `.next/trace`) → SSH-pipe → `releases/<sha>` поруч із живим `www`.
4. Копія `node_modules` з живого сайту + `npm install` (поки старий процес ще відповідає).
5. Стоп лише nmt Node (`127.1.10.37`), swap директорій, старт як панель: `npm run start -- --port=3000 --host=127.1.10.37`.
6. Healthcheck з HTTP-кодом; 5xx → `releases/previous`.

Локально той самий скрипт: `bash scripts/deploy-hosting.sh`. Відкат: `bash scripts/rollback-hosting.sh --yes`.

Секрет репо: `HOSTING_SSH_KEY` (PEM для `levelhst@levelhst.ftp.tools`).

Env на хостингу (не в git): `/home/levelhst/nmt.in.ua/www/.env.production` і постійна копія `/home/levelhst/nmt.in.ua/.env.production`.

Обовʼязкові на prod: `DB_*`, `SESSION_SECRET`, `CONTENT_IMPORT_API_KEY`, `ADMIN_API_KEY`, `MAX_BODY_BYTES=8388608`. Без `SESSION_SECRET` логін і реєстрація на проді падають.

## Безпека (без Cloudflare)

На shared-хостингу немає edge-WAF. У коді:

- `server.js` — `.env.production`, ліміт тіла (`MAX_BODY_BYTES`, дефолт 8 МіБ), early `413`
- `src/middleware.ts` — rate limit + auth guard + блок probe-шляхів
- `next.config.ts` — security headers (CSP, HSTS, …)
- Bearer auth на admin/import API — `timingSafeEqual` після SHA-256

`MAX_BODY_BYTES` має бути ≥ `MAX_REQUEST_BODY_BYTES` (8 МіБ у `src/modules/content-import/schema.ts`). Скрипт `scripts/ensure-hosting-max-body-bytes.sh` виставляє `8388608` на хостингу.

## Структура

```
src/app/                          маршрути дашборду + SEO metadata
src/app/login/                    форма входу + демо-кнопки
src/app/register/                 реєстрація учня
src/app/welcome/                  вітальна (завжди, без кабінетного хрома)
src/app/api/import/               POST імпорт CSV/JSON
src/app/api/admin/sessions/       POST призначення mentor-сесії
src/app/session/[id]/             інтерактивний тренажер
src/components/auth/              AuthShell, LoginForm, RegisterForm, DemoLoginButtons
src/components/welcome/           публічний лендінг (секції + landing.module.css)
src/components/ui/                Reveal, ModeTabs
src/components/dashboard/         Header, Sidebar, PageFrame, таблиці
src/components/testing/           TopicTrainer, summary, Ultimate UI
src/constants/                    навігація, SEO
src/modules/auth/                 app_users, cookie-сесія, ролі
src/modules/content-import/     модуль 2 — CSV/JSON → БД
src/modules/testing/              модуль 3 — сесії, відповіді, finish
src/modules/recommendations/      модуль 4 — stats, rules, graph, persist
src/modules/sessions/             список сесій, createMentorSession
src/modules/admin/                auth для admin API
src/middleware.ts                 rate limit + auth + probe paths
server.js                         hardened запуск на хостингу
.github/workflows/deploy-hosting.yml  merge в main → збірка + swap www
scripts/deploy-hosting.sh         єдиний реліз (локально або з CI)
scripts/rewrite-next-build-paths.sh  шляхи runner у .next → шлях хоста
scripts/hosting-remote-lib.sh     стоп / старт / health на хості
scripts/rollback-hosting.sh       аварійно повернути попередній www
scripts/reset-demo-student.mjs    очистка сесій demo-student
scripts/sql/                      DDL для app_users, reset demo
docs/deploy.md                    як потрапляє на nmt.in.ua
docs/mentor-tasks.md              pending-таски для команди
```

## Архітектура

- Тонкі сторінки в `src/app/` — лише рендер UI і metadata.
- Бізнес-логіка — у `src/modules/*` (не в `app/`).
- Server Actions для форм; HTTP API для machine-to-machine (імпорт, admin).
- Доступ до MySQL — тільки через `getConnection()` з `src/lib/db/mysql.ts`: пул один на процес
  (живе на `globalThis`, щоб HMR його не дублював), кожне з'єднання перевіряється `ping()` і при
  обриві знищується та береться наступне (3 спроби з бекофом). Мертвий сокет не валить весь пул.
- `getCurrentUser()` мемоізовано через `react.cache` — один запит користувача на рендер, а не
  окремий на layout / `generateMetadata` / сторінку.

---

## Модуль 2. Імпорт (CSV, JSON → БД)

| Що | Де |
| --- | --- |
| Парсинг і запис у БД | [`src/modules/content-import/`](src/modules/content-import/) |
| HTTP API | [`src/app/api/import/route.ts`](src/app/api/import/route.ts) |
| UI | [`/settings`](src/app/settings/page.tsx) — CSV/JSON через Server Action |

### Авторизація

```
Authorization: Bearer <CONTENT_IMPORT_API_KEY>
```

### Формат запиту — рівно одна форма

- **CSV:** поля `themes`, `themeConnections`, `quizTasks`
- **JSON:** поля `file` + `format=json`

Заголовки CSV:

```
themes.csv:            id,name,description,ord
theme_connections.csv: id,vertex_start,vertex_finish
quiz_tasks.csv:         id,name,task_text,theme_id,answer_1,answer_2,answer_3,answer_4,right_answer_n,comments
```

```bash
curl -X POST http://localhost:3000/api/import \
  -H "Authorization: Bearer $CONTENT_IMPORT_API_KEY" \
  -F "themes=@themes.csv;type=text/csv" \
  -F "themeConnections=@theme_connections.csv;type=text/csv" \
  -F "quizTasks=@quiz_tasks.csv;type=text/csv"
```

JSON-схема:

```json
{
  "themes": [{ "id": 1, "name": "...", "description": "...", "ord": 1 }],
  "themeConnections": [{ "id": 1, "vertex_start": 1, "vertex_finish": 2 }],
  "quizTasks": [{ "id": 1, "name": "...", "task_text": "...", "theme_id": 1, "answer_1": "...", "answer_2": "...", "answer_3": "...", "answer_4": "...", "right_answer_n": 1, "comments": "..." }]
}
```

### Коди відповіді

| Код | Причина |
| --- | --- |
| `200` | успішний імпорт |
| `400` | валідація / некоректна форма |
| `401` | немає або невірний Bearer |
| `413` | перевищено ліміт тіла (8 МіБ) або файлів (5 МіБ) |
| `415` | непідтримуваний формат |
| `500` | помилка сервера/БД (без витоку деталей) |

Запис — одна транзакція: `themes → theme_connections → quiz_tasks`.

---

## Модуль 3. Тести + тренажери

| Що | Де |
| --- | --- |
| Старт topic-test | `startTopicTest`, `startTopicTestAction` — [`src/modules/testing/`](src/modules/testing/) |
| Planned-сесії | `startPlannedSession` — auto/mentor рядки на `/sessions` |
| Тренажер | [`TopicTrainer`](src/components/testing/TopicTrainer/) на `/session/[id]` |
| Ultimate | 20 завдань, 20 хв, без підказок до кінця, розбір помилок |
| Симулятор НМТ | `/simulator` — `startNmtSimulatorAction` + `NmtTrainer` |
| Задачник | `/problems` — **заглушка** |

Режими на головній (`/`):

- **Звичайний** — до 10 випадкових завдань, миттєвий розбір після кожної відповіді.
- **Ultimate** — до 20 завдань, таймер 20 хв, підсумок і розбір помилок наприкінці.

```ts
import {
  startTopicTest,
  checkAnswer,
  finishTrainerSession,
} from "@/modules/testing";
```

---

## Модуль 4. Рекомендації

| Що | Де |
| --- | --- |
| Статистика учня | `getStudentTopicStats` |
| Правила | `recommendNextActions`, `recommendNextActionsForStats` |
| Граф тем | `getThemeConnectionsForThemes` — ребра `vertex_start → vertex_finish` |
| Auto-сесії | `persistRecommendations` — planned `session_type=2` |
| Mentor-сесії | `createMentorSession` + admin API — `session_type=3` |
| UI | `/results`, після finish, reopen completed `/session/[id]` |

Правила (скорочено): слабкі теми → повторний тест; невипробувані → спробувати; освоєна тема A за графом → тест теми B; 2+ слабких → консультація; усе solid → симулятор.

### Admin API — призначення mentor-сесії

```
POST /api/admin/sessions
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json

{ "userId": 1, "themeId": 2 }
```

Відповідь: `{ "ok": true, "sessionId": 42, "created": true }` (`201`) або `created: false` якщо planned mentor-сесія вже існує (`200`).

```bash
curl -X POST http://localhost:3000/api/admin/sessions \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "themeId": 2}'
```

На `/sessions` рядок з «Ким створено» = **Ментор**, статус **Заплановано**, кнопки **Старт** / **×**.

```ts
import {
  recommendNextActionsForStats,
  persistRecommendations,
} from "@/modules/recommendations";
```

---

## Мапа маршрутів

| Маршрут | Стан | Модуль |
| --- | --- | --- |
| `/` | Вітальна (гость) / Topic-test (учень) | 1, 3, 5 |
| `/welcome` | Вітальна (завжди, і для увійшлих) | 1 |
| `/login` | Вхід, демо-акаунти | 5 |
| `/register` | Реєстрація учня | 5 |
| `/session/[id]` | TopicTrainer | 3 |
| `/results` | Таблиця + рекомендації | 3, 4 |
| `/sessions` | Історія + planned (auto/mentor) + mentor assign | 3, 4, 5 |
| `/settings` | Імпорт контенту (admin) | 2, 5 |
| `/simulator` | Симулятор НМТ | 3 |
| `/problems` | Заглушка | 3 (pending) |
| `/materials` | Заглушка | контент |
| `/consultations` | Заглушка | 4 (дія) |
| `POST /api/import` | Реалізовано | 2 |
| `POST /api/admin/sessions` | Реалізовано | 4 |

---

## Тести

```bash
npm test
```

Покриття: import API, content-import validation/DB, testing actions, auth (password, session token), recommendations (включно з графом), sessions, admin API, SEO helpers.

Pending-робота для команди — [`docs/mentor-tasks.md`](docs/mentor-tasks.md).
