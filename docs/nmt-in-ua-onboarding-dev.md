# nmt.in.ua — гід для нового розробника

Як увійти в роботу за перший день, а не блукати тиждень.

Короткий онбординг команди Goldener Rechner. Беклог для PM — окремий файл ([md](./Goldener-Rechner-beklog-PM.md) / [docx](./Goldener-Rechner-beklog-PM.docx)). Тут лише те, що треба, щоб написати перший PR і не зламати чужий модуль.

Word-копія: [nmt-in-ua-onboarding-dev.docx](./nmt-in-ua-onboarding-dev.docx)

Оновлено 5 вересня 2026.

---

## 1. Що ми робимо

nmt.in.ua — тренажер підготовки до НМТ з математики. Учень логіниться, проходить тест за темою / Ultimate / симулятор, бачить результат і рекомендації. Викладач призначає сесію. Адмін імпортує завдання з CSV або JSON.

Живий сайт: <https://nmt.in.ua>  
Репозиторій: <https://github.com/tony-kobs/nmt.in.ua>

| Роль | Що може |
| --- | --- |
| Учень (`student`) | Тести, симулятор, результати, свої сесії, реєстрація |
| Викладач (`teacher`) | Усе як учень + призначити сесію на `/sessions` |
| Адмін (`admin`) | Усе як викладач + імпорт контенту на `/settings` |

## 2. Перший день — чекліст

- Отримай write-доступ до `tony-kobs/nmt.in.ua` і креденшли MySQL у team lead (Антон).
- Постав Node.js 20+ і npm. Клонуй репо, одразу `checkout dev` — не `main`.
- Скопіюй `.env.example` → `.env.local` і заповни `DB_*` плюс три секрети (див. §3).
- `npm install && npm run dev` → <http://localhost:3000>
- Залогінься як `demo-student` / `demo-teacher` / `demo-admin` (пароль `demo123`).
- Пройди happy-path: старт тесту → відповідь → фініш → `/results` → `/sessions`.
- Прочитай цей файл, `README.md`, `docs/deploy.md` і `.cursor/rules/design-system.mdc` (перед будь-якою версткою).
- Візьми задачу з відкритого беклогу (§11), заведи feature-гілку від свіжого `dev`.

Без живої MySQL тести модулів з БД і сам тренажер не заведуться. Локальний Next без `.env.local` відкриє лендінг, але кабінет впаде на запитах до бази.

## 3. Як підняти проєкт

```bash
git clone https://github.com/tony-kobs/nmt.in.ua.git
cd nmt.in.ua
git checkout dev
git pull origin dev
npm install
cp .env.example .env.local
npm run dev
```

### 3.1. Що обов’язково в `.env.local`

| Змінна | Навіщо | Якщо порожня |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Пул MySQL | Сторінки з даними падають |
| `SESSION_SECRET` | Підпис cookie `nmt_session` | На проді вхід небезпечний / зламаний |
| `CONTENT_IMPORT_API_KEY` | Bearer для `POST /api/import` | Усі імпорти — 401 (fail-closed) |
| `ADMIN_API_KEY` | Bearer для `POST /api/admin/sessions` | Усі admin-запити — 401 |

Секрети не комітити. Згенерувати: `openssl rand -hex 32`. `SESSION_SECRET` не копіюй з інших ключів.

### 3.2. Демо-акаунти

| Логін | Пароль | Роль | Навіщо зайти |
| --- | --- | --- | --- |
| `demo-student` | `demo123` | Учень | Тести, результати, свої сесії |
| `demo-teacher` | `demo123` | Викладач | Панель призначення на `/sessions` |
| `demo-admin` | `demo123` | Адмін | Форма імпорту на `/settings` |

Таблиця `app_users` створюється сама при першому запиті. Legacy-таблицю `users` на хостингу не чіпаємо. Якщо старі сесії «прилипли» до demo-student: `npm run reset-demo-student`.

### 3.3. Команди, які треба знати

| Команда | Коли |
| --- | --- |
| `npm run dev` | Щодня |
| `npm test` | Перед PR. Зараз ~192 кейси |
| `npm run lint` | Перед PR |
| `npm run build` | Перед здачею фічі, яка чіпає сторінки / сервер |
| `npm run reset-demo-student` | Коли демо-учень завалений старими сесіями |

## 4. Як працює команда

### 4.1. Гілки

Працюємо тільки з `dev`. У `main` напряму пушити не можна.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/коротка-назва
```

Далі: коміти → push → Pull Request `feature/…` → `dev`. Реліз на прод: `dev` → `main`.

Merge в `main` запускає [`.github/workflows/deploy-hosting.yml`](../.github/workflows/deploy-hosting.yml): Actions збирає Next, переписує шляхи runner у `.next`, кладе tar на хостинг. Сервер лише ставить `npm install` у `releases/<sha>` і міняє `www`. На хості `npm run build` не запускаємо (старий glibc). Vercel збирає `main` окремо; домен дивиться на хостинг.

Розробнику на хостинг ходити не треба і **не деплоїти самостійно**. Деталі, секрети, відкат: [`docs/deploy.md`](./deploy.md).

### 4.2. Правило шарів у коді

- `src/app/` — тонкі сторінки: metadata, рендер, виклик action. Без бізнес-логіки.
- `src/modules/` — уся логіка: тести, імпорт, рекомендації, auth, сесії.
- `src/components/` — UI. Стилі — CSS Modules поруч із компонентом.
- `src/lib/db/mysql.ts` — єдине місце, звідки ходимо в MySQL (`getConnection`).

**Нове правило:** `userId` у Server Actions береться з `requireUserId()`, ніколи з FormData. Інакше учень A побачить сесії учня B.

### 4.3. До кого йти

| Питання | Хто |
| --- | --- |
| Доступ, `.env`, деплой, архітектура, мердж у `dev` | Антон Кобись — akr.ep17m@gmail.com |
| Імпорт CSV/JSON, статистика тем, історія сесій | Валерій Солод — portmone1@gmail.com |
| Локалізація uk / en / de | Романна Брич — romannabric@gmail.com |
| Тренажер: відповідь і фініш | Валентин Бурий — groteskzp@gmail.com |
| Таймер сесії | Адам Перший |
| Симулятор НМТ | Юліана Снагустенко — carasyulia@gmail.com |
| Матеріали, таблиця сесій, KaTeX | Марія Погасєєва — mashenp@yahoo.com |
| Пріоритет задачі, scope, «чи робимо це зараз» | Наталія Степанова — nataliyastepano@gmail.com |

## 5. Карта репозиторію

| Шлях | Що тут |
| --- | --- |
| `src/app/` | Маршрути App Router + metadata |
| `src/app/welcome/` | Лендінг (завжди, навіть для увійшлих) |
| `src/app/login/` і `register/` | Вхід і реєстрація учня |
| `src/app/session/[id]/` | Тренажер однієї сесії |
| `src/app/simulator/` | Старт симулятора НМТ |
| `src/app/results/` і `sessions/` | Прогрес і історія |
| `src/app/settings/` | Імпорт (лише admin) |
| `src/app/api/import/` і `api/admin/sessions/` | Machine-to-machine API з Bearer |
| `src/components/welcome/` | Секції лендінгу + `landing.module.css` |
| `src/components/dashboard/` | Кабінет: header, sidebar, таблиці, старт тесту |
| `src/components/testing/` | TopicTrainer, NmtTrainer, підсумок, розбір помилок |
| `src/components/auth/` | AuthShell, форми входу / реєстрації |
| `src/components/ui/` | Reveal, ModeTabs, MathText |
| `src/modules/auth/` | Користувачі, cookie, паролі, ролі |
| `src/modules/content-import/` | CSV/JSON → БД |
| `src/modules/testing/` | Старт, checkAnswer, finish, симулятор, таймер |
| `src/modules/recommendations/` | Статистика, правила, граф тем, авто-сесії |
| `src/modules/sessions/` | Список сесій, createMentorSession |
| `src/modules/results/` | Агрегати для `/results` і сайдбару |
| `messages/uk.json`, `en.json`, `de.json` | Тексти інтерфейсу |
| `src/app/globals.css` | Дизайн-токени. Новий колір — сюди, не в компонент |
| `.cursor/rules/design-system.mdc` | Правила верстки. Читати перед CSS |
| `.cursor/rules/deploy-hosting.mdc` | Короткі правила релізу. Повна пам’ятка — `docs/deploy.md` |
| `.github/workflows/deploy-hosting.yml` | CI: merge в `main` → збірка → swap `www` |
| `scripts/deploy-hosting.sh` | Єдиний скрипт релізу (локально або з CI) |
| `scripts/rewrite-next-build-paths.sh` | Шляхи GitHub runner у `.next` → шлях хоста |
| `scripts/rollback-hosting.sh` | Повернути попередній `www` |
| `docs/deploy.md` | Як зміни потрапляють на nmt.in.ua |
| `docs/mentor-tasks.md` | Старий розклад задач. Частина статусів застаріла |

## 6. Як влаштований продукт у коді

### 6.1. Модулі (залежності)

Контент (модуль 2) → тест (3) → рекомендації (4) → auth (5). Модуль 1 — оболонка UI навколо них. Не пиши логіку тесту в компоненті й не ходи в MySQL з `page.tsx`.

| Модуль | Папка | Головні функції |
| --- | --- | --- |
| Auth | `src/modules/auth` | `requireUserId`, `getCurrentUser`, login/register actions |
| Імпорт | `src/modules/content-import` | parse + validate + транзакція `themes` → connections → `quiz_tasks` |
| Тест | `src/modules/testing` | `startTopicTest`, `startNmtSimulator`, `checkAnswer`, `finishTrainerSession` |
| Рекомендації | `src/modules/recommendations` | `getStudentTopicStats`, `recommendNextActions`, `persistRecommendations` |
| Сесії | `src/modules/sessions` | `getLearningSessions`, `createMentorSession`, cancel |

### 6.2. Таблиці MySQL, які чіпаємо

| Таблиця | Навіщо | Важливі поля |
| --- | --- | --- |
| `app_users` | Наші акаунти | `login`, `role`. Не плутати з legacy `users` |
| `themes` | Теми тесту | `id`, `name`, `description`, `ord` |
| `theme_connections` | Граф «наступна тема» | `vertex_start` → `vertex_finish` |
| `quiz_tasks` | Банк завдань | `right_answer_n` (1–4) лише на сервері |
| `task_sessions` | Спроба учня | `session_type` 1 user / 2 auto / 3 mentor / 4 NMT; status 1 done / 2 created / 3 planned |
| `site_feedback` | відгук про сайт (6.2) | `user_id`/`session_id` nullable, `score` 1–10, `message` (обов’язкове якщо score < 5), `email`, `source` footer/post_test |

**`right_answer_n` і `comments` не віддавай клієнту**, поки відповідь не перевірена або сесія не завершена. Перевірка завжди на сервері.

### 6.3. Типи сесій і режимів

| Режим | Де старт | Скільки | Поведінка |
| --- | --- | --- | --- |
| Звичайний тест | `/` → TopicTestStart | до 10 | Розбір одразу після відповіді |
| Ultimate | `/` → режим Ultimate | до 20, 20 хв | Підказки лише в кінці |
| Симулятор НМТ | `/simulator` | 22, 60 хв | `session_type = 4` |
| Авто-сесія | з’являється на `/sessions` | як тест | Створює recommend після фінішу |
| Ментор-сесія | викладач на `/sessions` | як тест | `session_type = 3`, Старт / × |

### 6.4. Маршрути

| URL | Хто бачить | Стан |
| --- | --- | --- |
| `/`, `/welcome` | Усі. `/` — лендінг для гостя, кабінет для учня; `/welcome` завжди лендінг | Готово |
| `/login`, `/register` | Гість | Готово |
| `/session/[id]` | Власник сесії | Готово |
| `/results`, `/sessions`, `/simulator` | Учень+ | Готово |
| `/settings` | Лише admin | Готово |
| `/materials` | Учень+ | Готово |
| `/problems`, `/consultations` | Учень+ | Заглушка `NavStubPage` — вільні задачі |

## 7. Як додавати фічу (шаблон)

- Логіка — нова функція в `src/modules/<модуль>/`. Експорт через `index.ts`.
- Server Action — у `modules/.../actions.ts`. Перший рядок після валідації: `const userId = await requireUserId()`.
- Сторінка в `src/app/.../page.tsx` лише збирає дані і рендерить компонент.
- UI — папка `Component/Component.tsx` + `Component.module.css`. Без Tailwind, без нових UI-бібліотек.
- Тексти — ключ у `messages/uk.json`, `en.json`, `de.json` одночасно. Не хардкодити рядок у JSX, якщо це бачить користувач.
- Колір, відступ, радіус — токен з `:root` у `globals.css`. Немає токена — додай туди, не вигадуй локальну змінну.
- Секція кабінету — `<section aria-labelledby>` і справжній заголовок. Один `h1` на сторінку.
- Тест на нову гілку логіки клади поруч: `foo.ts` → `foo.test.ts`. Запуск: `npm test`.
- Перед PR: `npm run lint && npm test`. Для UI ще глянь 375 / 768 / 1240 / 1440.

## 8. Верстка — мінімум, щоб не переробляли

Повний контракт: `.cursor/rules/design-system.mdc`. Якщо суперечить «як гарніше» — перемагає файл правил.

- Mobile-first. База — 320px. Далі лише `min-width`: 375 → 768 → 1240 → 1440 → 1920. Без `max-width`-медіа.
- Між брейкпоінтами гумимо через готові `clamp`-токени, не стрибками.
- Фіксована ширина з макета = `max-width`, ніколи голий `width`. На картках немає фіксованої `height`.
- Контейнер один: клас `.container`. Секція на всю ширину, контейнер усередині.
- Не використовуй чистий `#fff` — лише `var(--surface)` або теплий папір. Фон сторінки `--page #efe8d7`.
- Іконки — інлайн SVG з `currentColor`. Нових іконкових пакетів не ставимо.
- Анімації лише `transform` / `opacity`. Scroll-reveal — готовий `Reveal`. Вимикати через `prefers-reduced-motion`.

Граблі, які вже ловили: `display: grid` без колонок роздуває блок — став `grid-template-columns: minmax(0, 1fr)`. Пілюля в grid тягнеться на всю ширину — потрібен `justify-self`, не `align-self`.

## 9. Локалізація

Інтерфейс: uk / en / de через next-intl. Мова в cookie, URL без `/en`. Перемикач — на лендінгу (`LandingHeader`).

- Новий рядок UI → три файли `messages/*.json`.
- Назви тем і тексти завдань з БД не перекладаємо. Не заводь на це задачу «заодно».
- Помилки з Server Actions також через словник, не сирим українським рядком у модулі — якщо поруч уже є ключ.

## 10. Безпека — не зламай це

- Не світи секрети, не клади `.env.local` у git.
- Імпорт і admin API без ключа мають лишатися 401.
- Не віддавай `right_answer_n` на клієнт до перевірки.
- Не бери `userId` з форми. Тільки сесія.
- На проді demo-login вимкнений. Не вмикай `ALLOW_DEMO_LOGIN=1` на публічному сайті.
- Статика з `public/` (webp, шрифти) не повинна потрапляти під auth-guard — інакше картинки лендінгу редіректнуть на `/login`.

## 11. З чого почати новому dev (вільні задачі)

Повний розклад хвилі 6 — [`docs/mentor-tasks.md`](./mentor-tasks.md). Не чіпайте робочий topic-test без узгодження. Черга: **6.1 → 6.5 → 6.8 → 6.6 → 6.3–6.4**; **6.2** можна паралельно.

| Задача | Де копати | Складність | Нотатка |
| --- | --- | --- | --- |
| 6.1 Підручник + `themes.code` | `src/content/learningMaterials`, `/materials`, імпорт `themes` | Середня | Конспекти по класах лишити; TOC з якорями |
| 6.5 Банк 30–40 / тему | `content-import`, `docs/content-review/` | Контент | Спочатку розширити `varchar(50)` у відповідях |
| 6.8 Варіанти НМТ | `startNmtSimulator`, `/simulator`, нові таблиці | Середня | Не RAND по всій базі — випадковий *варіант* |
| 6.6 Задачник | `src/app/problems`, стилі TopicTrainer | Середня | Практика без ключа в DOM; друк через `window.print` |
| 6.3–6.4 Діагностика | `/diagnostic`, `Hero`, `TopicTestStart`, `TopicResultsTable` | Велика | Guest-cookie → claim при реєстрації |
| 6.2 Відгук про сайт | `src/modules/feedback`, футер, модалка після finish | Мала | ✅ зроблено; оцінка 1–10, коментар лише якщо < 5; не хедер; не `/consultations` |

Поза першим релізом (не хапати «бо цікаво»): групи викладача, ДЗ, PDF, Google-логін, AI-перевірка, типи завдань окрім вибору з 4 варіантів, повноцінний PWA. Це версія 2 — питайте PM.

## 12. Як здати роботу

- PR у `dev`, не в `main`. Назва: `feat: …` / `fix: …` / `docs: …`
- У `main` мерджити лише реліз. Це одразу деплоїть хостинг.
- У тілі PR: що змінилось для користувача, як перевірити, чи потрібна міграція БД (зазвичай ні).
- Не коміть `.env`, ключі, великі бінарники без потреби.
- UI: перевір порожній стан, помилку, вузький екран. Не здавай лише «у мене на 1440 ок».
- Якщо чіпаєш і фікс, і нову фічу — краще два PR.

Повний беклог продукту: [Goldener-Rechner-beklog-PM.md](./Goldener-Rechner-beklog-PM.md). Старі номери задач ментора живі в `docs/mentor-tasks.md`, але статуси там частково брешуть — орієнтуйся на цей гід і на код.

## 13. Перший прохід по сайту (щоб склалося в голові)

- Відкрий `/` як гість — це лендінг, не кабінет.
- Зареєструй тестового учня на `/register` або зайди як `demo-student`.
- На `/` обери тему, звичайний режим, Старт — потрапиш у `/session/[id]`.
- Відповідай, заверши, подивись підсумок і поради.
- Відкрий `/results` і `/sessions` — ті самі цифри мають збігатися.
- Вийди, зайди як `demo-teacher`, на `/sessions` признач сесію `demo-student`.
- Зайди як `demo-admin`, глянь форму на `/settings`. Не імпортуй випадковий файл у спільну базу без узгодження.
- Відкрий `/simulator` — це не той самий код, що короткий тест (`NmtTrainer`, `session_type` 4).
