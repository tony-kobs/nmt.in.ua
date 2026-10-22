# nmt.in.ua — гід для нового розробника

Локальну TG-007 інтеграцію перевірено 2026-10-06: Telegram API підтвердив повідомлення та кнопку «Деталі», MySQL зберіг `delivered`; другий запуск не створює дубля, сесія й завдання незмінні.

Як увійти в роботу за перший день, а не блукати тиждень.

Короткий онбординг команди Goldener Rechner. Беклог для PM — [`Goldener-Rechner-beklog-PM.md`](./Goldener-Rechner-beklog-PM.md). Тут лише те, що треба, щоб написати перший PR і не зламати чужий модуль.

Джерело правди — Markdown. Word/docx копій немає.

Оновлено 16 жовтня 2026.

---

## 1. Що ми робимо

nmt.in.ua — тренажер підготовки до НМТ з математики. Учень логіниться, проходить тест за темою / симулятор / діагностику, бачить результат і рекомендації. Викладач веде учнів і призначає тести. Адмін править банк і імпортує CSV/JSON.

Живий сайт: <https://nmt.in.ua>  
Репозиторій: <https://github.com/tony-kobs/nmt.in.ua>

Хостинг-акаунт `levelhst` спільний із WordPress/Moodle (science.kh.ua, it-ua.org тощо). Якщо антивірус панелі знайде PHP у `~/.system/tmp`, він ріже **вихідні** з’єднання всього акаунта — листи Brevo і зовнішні API nmt теж. nmt сам PHP не виконує. Після чистки в панелі обов’язково повторне сканування.

| Роль | Що може | Куди потрапляє з `/` |
| --- | --- | --- |
| Учень (`student`) | Тест за темою, симулятор, підручник, задачник, результати, сесії, консультації, `/join`. Реєстрація з марафону теж дає повний кабінет. Пункт «Марафон» додається, якщо учень приєднався. Дзвіночок у шапці — сповіщення на сайті | Старт тесту |
| Викладач (`teacher`) | `/assign`, `/students` (створити учня, групи, інвайти), результати й сесії учнів, консультації («Приєднати»), візитка на `/account`. Пункту «Тест за обраною темою» в меню немає | Редірект на `/assign` |
| Адмін (`admin`) | Банк MCQ на `/` (редактор `quiz_tasks`), імпорт `/settings`, відгуки `/feedback`, профілі `/profiles`, `/tasks/new` і `/tasks/[id]`. **Без** візитки й навчальних віджетів на `/account` | Редактор контенту, не тест |

## 2. Перший день — чекліст

- Отримай write-доступ до `tony-kobs/nmt.in.ua` і креденшли MySQL у team lead (Антон).
- Постав Node.js 20+ і npm. Клонуй репо, одразу `checkout dev` — не `main`.
- Скопіюй `.env.example` → `.env.local` і заповни `DB_*` плюс секрети (див. §3).
- `npm install && npm run dev` → <http://localhost:3000>
- Зареєструй тестовий акаунт на `/register` (або візьми готовий логін у lead). Адміна підвищують у БД: `node scripts/promote-admin.mjs <login>`.
- Пройди happy-path **учня**: старт тесту → відповідь → фініш → `/results` → `/sessions`. Потім перевір викладача й адміна (див. §13).
- Прочитай цей файл, `README.md`, `.cursor/rules/deploy-hosting.mdc` і `.cursor/rules/design-system.mdc` (перед будь-якою версткою).
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
| `SESSION_SECRET` | Підпис cookie `nmt_session` і `nmt_guest` | На проді вхід небезпечний / зламаний |
| `SITE_URL` | Origin у листах verify / reset (runtime) | Локально — `http://localhost:3000`. На проді без змінної або з localhost — `https://nmt.in.ua`. Не `NEXT_PUBLIC_*` |
| `MAIL_SITE_URL` | Запасний origin для листів | Той самий, що `SITE_URL` |
| `NEXT_PUBLIC_SITE_URL` | Canonical / WayForPay URL (інлайниться на `next build`) | SEO падає на `https://nmt.in.ua`. У листах не використовується. |
| `BREVO_API_KEY` | Листи verify / reset пароля | Локально без ключа — `[mail:log]` у консоль. На проді без ключа лист не йде. |
| `MAIL_FROM` | From для Brevo (опційно) | Дефолт `NMT.in.ua <noreply@nmt.in.ua>` |
| `WAYFORPAY_MERCHANT_ACCOUNT` | Еквайринг WayForPay (UI зараз на паузі) | Без ключів checkout не підписується. Пісочниця: `test_merch_n1`. Лише `.env.local` / хостинг |
| `WAYFORPAY_MERCHANT_SECRET_KEY` | SecretKey HMAC_MD5 (Purchase + serviceUrl) | Разом із account; ніколи в git |
| `WAYFORPAY_MERCHANT_DOMAIN` | Домен мерчанта (опційно) | Hostname з `NEXT_PUBLIC_SITE_URL` |
| `TEACHER_PAYMENT_TEST_BYPASS` | Кнопка «Оплата пройшла» на `/register/teacher` | За замовчуванням увімкнено лише в `development`. У production потрібні `=1` **і** sandbox `test_merch_n1`. На живому мерчанті в production завжди вимкнено |
| `CONTENT_IMPORT_API_KEY` | Bearer для `POST /api/import` | Усі імпорти — 401 (fail-closed) |
| `ADMIN_API_KEY` | Bearer для `POST /api/admin/sessions` | Усі admin-запити — 401 |

Секрети не комітити. Згенерувати: `openssl rand -hex 32`. `SESSION_SECRET` не копіюй з інших ключів.

Необов'язкові: пул MySQL (`DB_CONNECTION_LIMIT`, `DB_CONNECT_TIMEOUT_MS`, `DB_MAX_IDLE`, `DB_IDLE_TIMEOUT_MS`, `DB_PING_AFTER_IDLE_MS`), `DB_SSL`, `TRUSTED_PROXY_HOPS`, `MAX_BODY_BYTES` — див. `.env.example`.

### 3.2. Тестові акаунти

Демо-логінів (`demo-*`) більше немає. Для локальної перевірки:

1. Зареєструй учня / викладача на `/register`.
2. Адміна зроби скриптом: `node scripts/promote-admin.mjs <login>` (читає `DB_*` з `.env.local`).

Таблиця `app_users` створюється сама при першому запиті. Legacy-таблицю `users` на хостингу не чіпаємо.

### 3.3. Команди, які треба знати

| Команда | Коли |
| --- | --- |
| `npm run dev` | Щодня |
| `npm test` | Перед PR. Сотні кейсів у `src/**/*.test.ts` |
| `npm run lint` | Перед PR |
| `npm run build` | Перед здачею фічі, яка чіпає сторінки / сервер (`next build --webpack`) |
| `npm run migrate` | Застосувати `scripts/sql/` у локальну або хостову БД. Деплой робить це сам перед заміною `www`. Див. `docs/schema-migrations.md` |
| `node scripts/promote-admin.mjs <login>` | Підвищити акаунт до admin і відкликати його відкриті сесії (локальна / спільна БД) |

Перед здачею секції: `npm run lint && npm test && npm run build`.

## 4. Як працює команда

### 4.1. Гілки

Працюємо тільки з `dev`. У `main` напряму пушити не можна: pull request у `main` відкривають `tony-kobs` і `groteskzp` (Валентин Бурий), і лише з `dev`.

Pull request у `dev` потребує одного approve. Гілки `main` і `dev` не можна видалити і не можна переписати force-push. Інші гілки після merge видаляються самі.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/коротка-назва
```

Далі: коміти → push → Pull Request `feature/…` → `dev`. Реліз на прод: `dev` → `main`.

Merge в `main` запускає [`.github/workflows/deploy-hosting.yml`](../.github/workflows/deploy-hosting.yml): Actions збирає Next, переписує шляхи runner у `.next`, кладе tar на хостинг. У tar, крім `src/`, є `scripts/migrate.mjs`, `scripts/migrate-sql.mjs` і `scripts/sql/`. Сервер у `releases/<sha>` ставить `npm install` (`mysql2` з production-залежностей), потім `npm run migrate`, і лише після успішної міграції міняє `www`. На хості `npm run build` не запускаємо (старий glibc).

Розробнику на хостинг ходити не треба і **не деплоїти самостійно**. Секрети, відкат і що не робити на хості: [`.cursor/rules/deploy-hosting.mdc`](../.cursor/rules/deploy-hosting.mdc).

### 4.2. Правило шарів у коді

- `src/app/` — тонкі сторінки: metadata, рендер, виклик action. Без бізнес-логіки.
- `src/modules/` — уся логіка: тести, імпорт, рекомендації, auth, сесії.
- `src/components/` — UI. Стилі — CSS Modules поруч із компонентом.
- `src/lib/db/mysql.ts` — єдине місце, звідки ходимо в MySQL (`getConnection`).

**Нове правило:** `userId` у Server Actions береться з auth-модуля, ніколи з FormData. Інакше учень A побачить сесії учня B. Cookie лише впізнає сесію. `requireUser` / `requireRole` / `optionalLiveUser` і «гарячі» дії через `requireSessionUserId()` читають роль і бан з `app_users` (один раз на запит, `readLiveAccount`). Забанений або зниклий акаунт іде на `GET /api/auth/clear-session`. `getCurrentUser` лишає профіль з cookie для дешевих читань; захищені сторінки його не вважають джерелом ролі. Проксі теж лишається дешевою перевіркою cookie: повторна перевірка — у серверному шарі. Бан і зміна ролі (`scripts/promote-admin.mjs`) відкликають усі `user_sessions` цього користувача.

Групи маршрутів:

- `src/app/page.tsx` — `/`: гість — лендінг; учень — `CabinetHome`; викладач → `/assign`; адмін — редактор банку.
- `src/app/(marketing)/` — welcome, login, register, diagnostic, `/t/[slug]`, verify/forgot/reset.
- `src/app/(app)/` — кабінет, `force-dynamic`, `DashboardShell`.
- Root layout — лише `html`/`body` + `globals.css`.

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

### 4.4. Журнал змін

Опис pull request — джерело журналу. Дія [`.github/workflows/changelog.yml`](../.github/workflows/changelog.yml) додає коміт у гілку цього PR на `dev`: оновлюються [`docs/changelog.md`](./changelog.md) і блок нижче. У `dev` це потрапляє разом із мерджем PR, без окремого push. Скрінкаст з’являється тут лише після галочки «схвалено показувати». Коли відкривають реліз `dev` → `main`, дія відкриває ще один PR у `dev` із рядками для новин.

<!-- changelog:wiki -->
- **22 жовтня 2026** — [feat: денна статистика марафону для крону](https://github.com/tony-kobs/nmt.in.ua/pull/237). `GET /api/marathon/stats?marathon=<slug>` захищений тим самим `Authorization: Bearer` і `MARATHON_CRON_SECRET`, що й розсилка. Порожній секрет або хибний заголовок — 401, порожнє тіло. Хибний slug — 400. Невідомий slug або не денний курс — 404, порожнє тіло, без чужих цифр. Успіх: `cache-control: no-store`. Відповідь: `slug`, `registered`, `telegramLinked`, `finished`, `days[]` (`day`, `opened`, `completed`, `avgScore`, `dropoff`), `ticketsOpen`, `deliveryErrors24h`. - `opened` — є рядок `marathon_day_progress` цього дня. - `completed` — у рядка є `completed_at`. `avgScore` — середній бал таких днів, ціле, або `null`. - Відсів дня 1: зареєстровані мінус здані, не нижче 0. Далі: здані попереднього дня мінус здані цього, не нижче 0. - `ticketsOpen` — `support_tickets` зі статусом `new` або `in_progress`. Якщо таблиці ще немає (її додає окремий PR), у відповіді 0. - `deliveryErrors24h` — сума `failed` за 24 години в `marathon_telegram_outbox` (`created_at`, цей курс), `marathon_message_jobs` (`created_at`) і `marathon_notifications` (`outcome = failed`, `sent_at`). Немає таблиці чи колонки — це джерело дає 0. Та сама воронка на картці списку `/admin/marathons`, під наявними цифрами. Воронка джерел у редакторі лишається окремо. Шлях лише в IP-стелі ліміту запитів. Нової міграції немає. Нової змінної немає: той самий `MARATHON_CRON_SECRET`. Номери `050`, `051` і `052` зайняті відкритими PR і тут не використовуються. Перевірки: `npm test` 1442 pass / 0 fail / 3 skipped, `npx tsc --noEmit`, eslint по змінених файлах, `npm run build` (Next 16.3.3, маршрут `/api/marathon/stats`). Адмінку в браузері не відкривав: у цьому середовищі немає бази й сесії адміна.
- **22 жовтня 2026** — [feat: пульс крону розсилки марафону](https://github.com/tony-kobs/nmt.in.ua/pull/234). Успішний `POST /api/marathon/notifications/process` пише час і лічильники планувальника в `marathon_cron_heartbeat`. Якщо планування впало (відповідь 500), час не оновлюється. Збій запису пульсу не ламає саму розсилку. `GET /api/marathon/notifications/health` з тим самим `Authorization: Bearer <MARATHON_CRON_SECRET>`. Без секрету — 401 і порожнє тіло. Успіх, `cache-control: no-store`: ```json { "lastRunAt": "2026-10-26T06:10:00.000Z", "ageMinutes": 8, "ok": true, "lastCounts": { "processed": 4, "sent": 3, "failed": 1 }, "pendingOutbox": 0, "failedLast24h": 1 } ``` `ok` — true, коли останній успішний запуск не старіший за 25 хвилин (крон кожні 10). Немає запуску: `lastRunAt`, `ageMinutes` і `lastCounts` — null, `ok` — false. `processed` — сума sent + skipped + failed цього тіку. `pendingOutbox` — черга Telegram зі статусом pending. `failedLast24h` — зірвані за 24 години рядки черги Telegram, черги повідомлень і `marathon_notifications` з outcome failed. На `/admin/marathons` зверху пілюля: зелена «Крон працює» або рожева «Крон мовчить» / «ще не запускався». Міграція `scripts/sql/050_marathon_cron_heartbeat.sql`. Перед продом потрібен бекап бази. Та сама таблиця створюється ліниво в `migrateDailyMarathon`. Перевірки: `npm test` 1442 pass / 0 fail / 3 skipped, `npx tsc --noEmit`, eslint по змінених файлах, `npm run build` (Next 16.3.3).
- **22 жовтня 2026** — [feat: тихі години, загальна таблиця і старі кнопки бота](https://github.com/tony-kobs/nmt.in.ua/pull/232). Свій початок і кінець тихих годин (0–23). Довільна пара годин більше не скидається на «вимкнено»; вікно діє, коли задані обидва краї. «Таблиця» — цей курс (`rank_course`). «Загальні» (`mh:all`) — сума днів усіх денних курсів, як «Загальні» на сайті. Обидві таблиці в меню. Старий підпис нижньої кнопки лишається дійсним: збіг із поточним текстом, типовим текстом і підписами в `marathon_button_labels`. У меню викладача є «Марафон». Нові тексти адмінки: `bot_btn_overall`, `rank_course`, `rank_overall`. Статуси хронології не змінювались. Міграція `scripts/sql/049_marathon_button_labels.sql`. Перед продом потрібен бекап бази. Та сама таблиця створюється ліниво в `migrateDailyMarathon`. Перевірки: `npm test` 1439 pass / 0 fail / 3 skipped, `npx tsc --noEmit`, eslint по змінених файлах, `npm run build` (Next 16.3.3).
- **22 жовтня 2026** — [feat: день марафону в боті одним повідомленням](https://github.com/tony-kobs/nmt.in.ua/pull/231). feat: день марафону в боті одним повідомленням
- **22 жовтня 2026** — [fix: пауза одного марафону і вікна розсилки](https://github.com/tony-kobs/nmt.in.ua/pull/230). fix: пауза одного марафону і вікна розсилки
- **22 жовтня 2026** — [fix: TypeScript spotlight і gitignore для dumps](https://github.com/tony-kobs/nmt.in.ua/pull/228). fix: TypeScript spotlight і gitignore для dumps
- **21 жовтня 2026** — [Відкладене видалення акаунта на 14 днів](https://github.com/tony-kobs/nmt.in.ua/pull/224). Звичайний акаунт після «Видалити акаунт» не зникає одразу. На `app_users` пишуться `deletion_requested_at`, `deletion_due_at` (+14 днів), `deletion_requested_by` і хеш одноразового посилання. Забанений акаунт видаляється тією самою логікою, що й раніше, без листа і без строку. Лист іде через наявний Brevo (`sendMail`, Node HTTPS). Окремого редактора текстів для листів входу немає (копія марафону — лише на курс), тож текст попередження лежить поруч із листами підтвердження пошти. Якщо лист не пішов, строк лишається, адмін бачить попередження. «Зберегти акаунт» (`/keep-account?token=`) і вхід скасовують строк і ставлять адмінам дзвіночок `admin.account_kept`. За ~3 дні до строку — нагадування з посиланням на вхід (сирий токен у базі не зберігається). Крон `/api/marathon/notifications/process` після розсилки дочищає прострочені акаунти і шле нагадування. Поки строк висить, учасник не потрапляє в розсилки марафону і системні Telegram-повідомлення. **Міграція `scripts/sql/048_account_deletion_grace.sql`.** Перед продом потрібен бекап бази. Файл ідемпотентний (окремі `ADD COLUMN`, errno 1060 пропускається).
- **21 жовтня 2026** — [Відносний час «був на сайті» на профілях](https://github.com/tony-kobs/nmt.in.ua/pull/223). На `/profiles` бейдж «був на сайті» більше не рахує сотні годин. Спільний хелпер `src/lib/relativeTime.ts`: менше хвилини — «щойно», далі хвилини, години до 48, потім дні («3 дні тому»), від 30 днів місяці («2 місяці тому»), від 12 місяців роки («1 рік тому»). Українські форми: день/дні/днів, місяць/місяці/місяців, рік/роки/років. Підказка на бейджі і рядок «Був у кабінеті» — точна дата й час за Києвом. Той самий хелпер лишається єдиним місцем для відносного часу в адмінці. Нової міграції немає.
<!-- /changelog:wiki -->

## 5. Карта репозиторію

| Шлях | Що тут |
| --- | --- |
| `src/app/` | Маршрути App Router + metadata |
| `src/app/_home/CabinetHome.tsx` | Кабінет на `/` залежно від ролі |
| `src/proxy.ts` | Бюджет запитів (`src/lib/requestBudget.ts`: окремо користувач і IP класу; prefetch і статика не рахуються) + auth-guard + ролі admin / teacher |
| `src/app/(marketing)/` | Лендінг, auth, діагностика, публічна візитка |
| `src/app/(app)/session/[id]/` | Тренажер однієї сесії |
| `src/app/(app)/simulator/` | Старт симулятора НМТ |
| `src/app/(app)/results/` і `sessions/` | Прогрес і історія (учень або клас викладача) |
| `src/app/(app)/settings/` | Імпорт (лише admin) |
| `src/app/(app)/feedback/` | Список відгуків (лише admin) |
| `src/app/(app)/profiles/` | Профілі: бан / видалення (лише admin). Звичайний акаунт — 14 днів і лист; забанений — одразу |
| `src/app/(app)/tasks/` | CRUD завдання банку (лише admin) |
| `src/app/(app)/assign/` | Призначити тест (teacher/admin) |
| `src/app/(app)/students/` | Мої учні, групи, інвайти |
| `src/app/(app)/practice/fractions/` | Генерована практика дробів |
| `src/app/(app)/practice/interactive/` | Редірект → `/?tab=interactive` |
| `src/app/api/import/` і `api/admin/sessions/` | Machine-to-machine API з Bearer |
| `src/app/api/payments/wayforpay/` | Webhook і return еквайрингу |
| `src/components/welcome/` | Секції лендінгу + `landing.module.css`; `#teachers` — публічні візитки або демо-візитка + пропозиція; `DevTeam` — команда + послуги (розробка/підтримка) |
| `src/components/dashboard/` | Кабінет: header, sidebar, таблиці, старт тесту |
| `src/components/account/` | `/account` + редактор візитки викладача (досвід, наукові роботи) |
| `src/components/admin/` | Редактор банку, форма завдання, профілі |
| `src/components/teachers/` | Публічна картка `/t/{slug}` |
| `src/components/testing/` | TopicTrainer, NmtTrainer, підсумок, розбір помилок |
| `src/components/practice/` | Дроби + картки Stage 2 (order / find_error / graph / matching / blank) |
| `src/components/auth/` | AuthShell, форми входу / реєстрації / verify / reset |
| `src/components/ui/` | Reveal, ModeTabs, MathText |
| `src/components/practice/` | `FractionPracticeTrainer` — генерована практика дробів (11.09) |
| `src/modules/auth/` | Користувачі, cookie, паролі, ролі, email verify/reset |
| `src/modules/mail/` | Brevo / log-транзакційні листи |
| `src/modules/payments/` | Реєстрація викладача, WayForPay Purchase, webhook |
| `src/modules/content-import/` | CSV/JSON → БД |
| `src/modules/admin-content/` | CRUD `quiz_tasks`: список, складність, легенда теми, видалення навіть якщо завдання вже в сесії (сесія перераховується) |
| `src/modules/admin-profiles/` | Список / бан / видалення акаунтів |
| `src/modules/testing/` | Старт, checkAnswer, finish, симулятор, таймер |
| `src/modules/stage2/` | Інтерактивні формати (окремі таблиці, не `task_sessions`) |
| `src/modules/diagnostic/` | Публічна діагностика гостя/учня (окремо від topic-test) |
| `src/modules/problemGenerators/` | Чисті генератори (без БД); зараз `fractionAddition` |
| `src/modules/fractionPractice/` | Server Actions для `/practice/fractions` — без запису в сесії БД |
| `src/modules/recommendations/` | Статистика, правила, граф тем, авто-сесії |
| `src/modules/sessions/` | Список сесій, createMentorSession, сесії класу викладача |
| `src/modules/results/` | Агрегати `/results` + `teacherStudentResults` |
| `src/modules/mentor-assignments/` | Групове призначення тестів (`/assign`) |
| `src/modules/teacher-students/` | Roster, групи, інвайти, створення учня |
| `src/modules/teachers/` | Візитка + карусель/рейтинги на `/consultations` + список для лендінгу |
| `src/modules/consultations/` | Заявки учня + інбокс викладача |
| `src/modules/self-score/` | Самооцінка 1–10 (історія, не overwrite) |
| `src/modules/feedback/` | Відгук про сайт |
| `messages/uk.json`, `en.json`, `de.json` | Тексти інтерфейсу |
| `src/app/globals.css` | Дизайн-токени. Новий колір — сюди |
| `.cursor/rules/design-system.mdc` | Правила верстки. Читати перед CSS |
| `.cursor/rules/deploy-hosting.mdc` | Короткі правила релізу |
| `scripts/sql/` | Міграції. Застосування — `npm run migrate` (`docs/schema-migrations.md`). `ensure*` на запиті нічого не змінює, якщо версії вже в `schema_migrations` |
| `docs/Goldener-Rechner-beklog-PM.md` | Беклог для PM |
| `docs/changelog.md` | Журнал змін з описів PR. Блок у §4.4 береться звідси |

## 6. Як влаштований продукт у коді

### 6.1. Модулі (залежності)

Контент (модуль 2) → тест (3) → рекомендації (4) → auth (5). Модуль 1 — оболонка UI навколо них. Не пиши логіку тесту в компоненті й не ходи в MySQL з `page.tsx`.

| Модуль | Папка | Головні функції |
| --- | --- | --- |
| Auth | `src/modules/auth` | `requireUserId`, `requireSessionUserId`, `getCurrentUser`, login/register/`changePassword` |
| Оплата | `src/modules/payments` | `startTeacherRegistration`, `applyWayForPayWebhook`, `simulateTeacherPaymentSuccess`, `buildWayForPayCheckout` |
| Імпорт | `src/modules/content-import` | parse + validate + транзакція `themes` → connections → `quiz_tasks` (+ опційно `problems`) |
| Адмін-банк | `src/modules/admin-content` | список, створення, складність, легенда теми, видалення `quiz_tasks` (у тому числі з сесій) |
| Профілі | `src/modules/admin-profiles` | фільтр, бан, видалення |
| Тест | `src/modules/testing` | `startTopicTest`, `startNmtSimulator`, `checkAnswer`, `finishTrainerSession` |
| Stage 2 | `src/modules/stage2` | 5 форматів + раунди `practice`/`diagnostic`; вкладка ховається, якщо каталог порожній |
| Рекомендації | `src/modules/recommendations` | `getStudentTopicStats`, `recommendNextActions`, `persistRecommendations` |
| Сесії | `src/modules/sessions` | `getLearningSessions`, `createMentorSession`, `teacherLearningSessions` |
| Призначення | `src/modules/mentor-assignments` | `createMentorAssignment`, list/detail, cancel, update members |
| Учні викладача | `src/modules/teacher-students` | `createStudentForTeacher`, `linkStudentByLogin`, групи, інвайти |
| Самооцінка | `src/modules/self-score` | історія 1–10; на `/results` селект; діагностика більше не пише overall |
| Діагностика | `src/modules/diagnostic` | окремо від `testing`; guest cookie + `claimGuestProgress` при реєстрації |
| Генератори | `src/modules/problemGenerators` | без БД/Next. `fractionAddition` |
| Практика дробів | `src/modules/fractionPractice` | обгортка генератора для `/practice/fractions` |
| Візитка | `src/modules/teachers` | профіль + публічна картка + рейтинги |
| Консультації | `src/modules/consultations` | заявка учня, інбокс, «Приєднати» |

### 6.2. Таблиці MySQL, які чіпаємо

| Таблиця | Навіщо | Важливі поля |
| --- | --- | --- |
| `app_users` | Наші акаунти | `login`, `email` / `email_verified_at` (022), `email_verify_required` (036: публічна реєстрація = 1, логін до підтвердження закритий; 0 — старі рядки й учні, яких створив викладач, входять і бачать банер). Демо exempt. `role`, `is_banned` (020), `last_login_at` / `last_seen_at` (021). Не плутати з legacy `users` |
| `user_sessions` | Точки входу | `user_id`, `expires_at`, `revoked_at`, `last_seen_at`, `ip`, `user_agent`. Онлайн = невідкликана і не прострочена сесія з активністю за 5 хв. SQL `044` + lazy `ensureUserSessionsSchema`. Старий `ip` — NULL, у списку «—» |
| `auth_tokens` | Verify / reset | `user_id`, `purpose` email_verify\|password_reset, `token_hash`, `expires_at`, `used_at`. Підтвердження email — 24 год, одноразове. SQL `023_auth_tokens.sql` + lazy `ensureAuthTokenSchema`. Листи через Brevo (`BREVO_API_KEY` / `MAIL_FROM`) або log у dev |
| `user_avatars` | Фото профілю | `user_id`, `mime`, `bytes` MEDIUMBLOB. Лениво `CREATE` у `ensureAuthSchema` / `015_user_avatars.sql` |
| `teacher_profiles` | Публічна візитка | `user_id`, `slug` unique, `headline`, `bio`, `city`, `subjects` (JSON), `contact_url`, `is_public`. `018_teacher_profiles.sql` + lazy `ensureTeacherProfileSchema` |
| `teacher_ratings` | Оцінки учнів викладачам (1–5) | PK `(teacher_user_id, student_user_id)`, `score`. `032_teacher_ratings.sql` + lazy `ensureTeacherRatingsSchema` |
| `teacher_payments` | Pending реєстрація викладача до оплати WayForPay | `reference`, hashed пароль, `status` pending/paid/failed, `provider`, `external_order_id`; `user_id` після Approved. SQL `014_teacher_payments.sql` |
| `themes` | Теми тесту | `id`, `code` (unique, напр. `ALG-08-QUAD-EQ` — якір розділу підручника), `name`, `description`, `ord` |
| `theme_connections` | Граф «наступна тема» | `vertex_start` → `vertex_finish` |
| `quiz_tasks` | Банк MCQ тренажера / діагностики | `right_answer_n` (1–4) лише на сервері до перевірки |
| `problems` | Банк задачника (друк) | Read UI з JSON-каталогу; таблиця для імпорту |
| `nmt_variants` / `nmt_quiz_tasks` / `nmt_variant_tasks` | Офіційні варіанти симулятора | **Не** змішувати з `quiz_tasks`. SQL `011`–`013` |
| `task_sessions` | Спроба учня | `session_type` 1 user / 2 auto / 3 mentor / 4 NMT / **5 diagnostic**; status 1 done / 2 created / 3 planned. `user_id` і `theme_id` nullable + `guest_token`. `expire_time` — фіксований дедлайн 24 год від створення рядка |
| `tasks2session` | Мапінг завдання↔сесія | `status` 0 / 1 / −1; той самий owner, що в сесії |
| `site_feedback` | Відгук про сайт | `score` 1–10; `message` обов’язкове якщо score < 5. Після збереження адміни отримують `user_notifications` (`admin.feedback`) і лист; категорії `user_channel_preferences` на ці алерти не діють. Збій сповіщення не відкочує відгук |
| `consultation_requests` | Заявки на консультацію | один відкритий запит на учня. `019` |
| `user_self_scores` | Самооцінка, **історія** | рівно один з `user_id` / `guest_token`; `score` 1–10. `007` |
| `teacher_students` | Roster | unique pair викладач↔учень. `017` |
| `student_groups` / `student_group_members` / `student_invites` | Групи й інвайти | одна група на викладача на учня; код 14 днів. `034` |
| `mentor_assignments` / `mentor_assignment_members` | Групове ДЗ | тема + `due_at` + `session_id`. `033` |
| `practice_stage2_attempts` + `order_tasks` / `find_error_tasks` / `graph_tasks` / `matching_tasks` / `blank_tasks` | Stage 2 | **не** `task_sessions`. Міграції `026`–`031` |
| `practice_interactive_rounds` / `practice_interactive_round_tasks` | Раунд із 20 задач (5 форматів × 4) | `031` |

**`right_answer_n` і `comments` не віддавай клієнту**, поки відповідь не перевірена або сесія не завершена. Перевірка завжди на сервері.

**Індекси.** `scripts/sql/009_trainer_hot_path_indexes.sql` — `tasks2session(session_id)` тощо. Перед запуском — `SHOW CREATE TABLE`: у MySQL немає `ADD INDEX IF NOT EXISTS`.

`scripts/sql/010_theme_codes.sql` — `themes.code` для підручника. Імпорт код приймає опційно.

`scripts/sql/043_fix_theme_geometry_typo.sql` — «геоментрія» → «геометрія». Деплой проганяє весь каталог `scripts/sql` перед заміною релізу. Колонки візитки — `025_teacher_profile_fields.sql`, журнал Telegram — `037_telegram_task_notifications.sql`. Поки міграція не записана, `ensure*` ще вміє ті самі зміни під локом `nmt_schema`.

**Stage 2 локально:** `026` → `027` → `028` → `029` → `030` → `031` (031 після 028). Без каталогу вкладка «Інтерактивні формати» на `/` **ховається**.

### Гостьова діагностика: модель власності

Публічний `/diagnostic` не вимагає логіну. Гість — підписана cookie `nmt_guest` (`src/modules/auth/guestToken.ts`, HMAC на `SESSION_SECRET`). Запити фільтрують рівно одного власника: `user_id` **або** `guest_token AND user_id IS NULL`. Cookie `nmt_guest` **ніколи** не авторизує кабінет (`src/proxy.ts` її не читає).

При реєстрації з `/register?from=diagnostic` — `claimGuestProgress()` переносить сесії й самооцінки на нового `userId`.

Адаптивність: старт складності 1; правильно → +1; помилка → −1 (не нижче 1); три помилки підряд на рівні 1 — кінець; до 10 завдань; кожне наступне — інша тема.

### 6.3. Типи сесій і режимів

| Режим | Де старт | Скільки | Поведінка |
| --- | --- | --- | --- |
| Звичайний тест | `/` → TopicTestStart | скільки впишеш (макс. банк теми) | Розбір одразу (колір + іконка; без банера «Правильно») |
| Симулятор НМТ | `/simulator` | офіційний варіант, 60 хв | `session_type = 4`, банк `nmt_quiz_tasks` |
| Авто-сесія | з’являється на `/sessions` | як тест | Створює recommend після фінішу |
| Ментор-сесія | викладач на `/assign` | як тест | `session_type = 3`; групове призначення з дедлайном |
| Діагностика | `/diagnostic` (публічний) | до 10; стоп при 3 fail@1 | `session_type = 5`, `theme_id = NULL`; без самооцінки перед темами |
| Stage 2 | `/?tab=interactive` | раунд 20 задач | Окремі таблиці; одна повторна спроба, потім reveal |
| Практика дробів | `/practice/fractions` | генератор, 5 рівнів | Без рядків у `task_sessions` |

`src/modules/testing/sessionMode.ts` — єдине місце, де `TrainerMode` мапиться на `diagnostic` / `practice` / `exam`. Не розмножуй `if (mode === "diagnostic")` у компонентах.

Підказка / «схоже завдання» під час topic-test **зняті з UI**. Server Actions `getTaskHint` / `addSimilarPracticeTask` лишаються. Ultimate як продукт на старті `/` знято (legacy-код режиму може ще бути).

### 6.4. Маршрути

| URL | Хто бачить | Стан |
| --- | --- | --- |
| `/`, `/welcome` | Усі. `/` — лендінг для гостя, кабінет для учня; `/welcome` завжди лендінг | Готово |
| `/login`, `/register` | Гість | Готово. На `/register` вибір учень/викладач (`?role=`). Email → check-email → verify |
| `/register/check-email`, `/verify-email` | Гість | Підтвердження email (Brevo / log). Після verify — сесія |
| `/forgot-password`, `/reset-password` | Гість | Скидання пароля за email (лише verified акаунти) |
| `/register/teacher` (+ `/success`, `/fail`) | Гість | UI оплати приховано: `/register/teacher` → `/register?role=teacher`. WayForPay success/fail лишаються для старих чеків |
| `/diagnostic`, `/diagnostic/session/[id]` | Усі (публічно, як `/welcome`) — гість або увійдений учень | Готово |
| `/session/[id]` | Власник сесії | Готово |
| `/simulator` | Учень+ | Офіційні варіанти (`nmt_variants`) |
| `/settings` | Лише admin | Імпорт |
| `/feedback` | Лише admin | `site_feedback` |
| `/profiles` | Лише admin | Бан / видалення. Звичайний акаунт: лист Brevo, 14 днів, «Зберегти акаунт» або вхід. Забанений — одразу і без листа. Демо й власний акаунт захищені |
| `/tasks/new`, `/tasks/[id]` | Лише admin | Редактор одного `quiz_tasks` |
| `/materials`, `/materials/[slug]` | Учень+ | Редірект → `/materials/textbook` |
| `/materials/textbook` | Учень+ | Один розділ `?topic=<themes.code>` |
| `/problems` | Учень+ | Друкований тест по темі |
| `/account` | Учень+ | Фото / пароль / вихід. Викладач — візитка; адмін — без навчальних віджетів |
| `/assign` | teacher/admin (сторінка `requireRole`; учень не в меню) | Призначити тест |
| `/students`, `/students/[id]` | teacher/admin (`proxy`) | Roster + статистика учня |
| `/join`, `/join/[code]` | Учень (гість → логін, код у шляху) | Прийняти інвайт |
| `/consultations` | Учень+ | Карусель викладачів + заявка / інбокс |
| `/practice/fractions` | Учень+ | Генератор дробів |
| `/practice/interactive` | Учень+ | Редірект на `/?tab=interactive` |

Публічні шляхи без сесії: `src/constants/publicRoutes.ts`. Випадковий `/foo` без сесії → `/login`. `/welcome/немає` → кастомний 404.

### 6.5. Генеровані завдання й Stage 2 — коротко

**Дроби** (`fractionAddition`): задача ефемерна. Клієнт отримує доданки + `{level, seed}`; сервер регенерує той самий таск і перевіряє. Ключ відповіді на клієнт не йде. Не чіпає `TopicTrainer`.

**Stage 2:** п’ять форматів зі своїми таблицями контенту і спільною `practice_stage2_attempts`. Не додавай новий `task_sessions.session_type` заради них. Усі дії: `requireSessionUserId()` → членство в раунді → `FOR UPDATE`.

## 7. Як додавати фічу (шаблон)

- Логіка — нова функція в `src/modules/<модуль>/`. Експорт через `index.ts`.
- Вхід з форми або JSON спочатку проходить Joi-схему в `src/validations/` (`validateSchema`). Невідомі поля відхиляються, у дію потрапляє вже нормалізоване значення. Коди помилок для UI лишаються в обгортці модуля. Так само, як celebrate + Joi на RelaxMap, тільки без Express.
- Server Action — у `modules/.../actions.ts`. Перший рядок після валідації: `const userId = await requireUserId()` (або `requireSessionUserId()` для гарячого шляху).
- Сторінка в `src/app/.../page.tsx` лише збирає дані і рендерить компонент.
- UI — папка `Component/Component.tsx` + `Component.module.css`. Без Tailwind, без нових UI-бібліотек.
- Тексти — ключ у `messages/uk.json`, `en.json`, `de.json` одночасно.
- Колір, відступ, радіус — токен з `:root` у `globals.css`.
- Секція кабінету — `<section aria-labelledby>` і справжній заголовок. Один `h1` на сторінку.
- Тест: `foo.ts` → `foo.test.ts`. Запуск: `npm test`.
- Нова публічна сторінка — додай в `PUBLIC_PAGE_PATHS` **і** перевір `proxy.ts`.
- Перед PR: `npm run lint && npm test`. Для UI ще глянь 375 / 768 / 1240 / 1440 / 1920.

## 8. Верстка — мінімум, щоб не переробляли

Повний контракт: `.cursor/rules/design-system.mdc`. Якщо суперечить «як гарніше» — перемагає файл правил.

- Mobile-first. База — 320px. Далі лише `min-width`: 375 → 768 → 1240 → 1440 → 1920. Без `max-width`-медіа.
- Між брейкпоінтами гумимо через готові `clamp`-токени, не стрибками.
- Фіксована ширина з макета = `max-width`, ніколи голий `width`. На картках немає фіксованої `height`.
- Контейнер один: клас `.container`. Секція на всю ширину, контейнер усередині.
- Не використовуй чистий `#fff` — лише `var(--surface)` або теплий папір. Фон сторінки `--page #efe8d7`.
- Іконки — інлайн SVG з `currentColor`. Нових іконкових пакетів не ставимо.
- Анімації лише `transform` / `opacity`. Scroll-reveal — `Reveal` (Motion `whileInView`). Вимикати через `prefers-reduced-motion`. Списки — `Select`, не нативний `<select>`. 404 / помилка / loading — `src/components/status/StatusScene`.

Граблі: `display: grid` без колонок роздуває блок — став `grid-template-columns: minmax(0, 1fr)`. Пілюля в grid тягнеться на всю ширину — `justify-self`, не `align-self`. Не став `z-index` на `.body` кабінету (сайдбар тоді падає під мобільний backdrop).

## 9. Локалізація

Інтерфейс: uk / en / de через next-intl. Мова в cookie, URL без `/en`. Перемикач — `LanguageSwitcher` на лендінгу і на `/t/{slug}`: коди UA / EN / DE, у меню ендоніми, без прапорів.

- Новий рядок UI → три файли `messages/*.json`.
- Назви тем і тексти завдань з БД не перекладаємо.
- Помилки з Server Actions — через словник, не сирим рядком у модулі.
- Клієнтський intl: `pickClientMessages(pathname)` — на публічні маршрути не тягни весь кабінет.

Небезпечні дії в кабінеті питають `window.confirm` перед submit.

## 10. Безпека — не зламай це

- Не світи секрети, не клади `.env.local` у git.
- Імпорт і admin API без ключа мають лишатися 401.
- Не віддавай `right_answer_n` на клієнт до перевірки в **тесті / сесії**. Задачник `/problems` — ключ можна тримати в HTML і ховати CSS-ом (за замовчуванням сховано).
- Не бери `userId` з форми. Тільки сесія.
- Логіни з префіксом `demo-` зарезервовані (реєстрація відхилить). Окремих seed-демо-акаунтів немає.
- Статика з `public/` не повинна потрапляти під auth-guard.
- Cookie сесії: `setSessionCookie` дає новий `exp`; `renewSessionCookie` **зберігає старий `exp`**. Не повертай `setSessionCookie` у профільні дії (аватар, upgrade cookie). `task_sessions.expire_time` ставиться раз при створенні. Див. `src/modules/testing/sessionExpiry.ts`.
- Presence: `POST /api/presence` раз на хвилину з кабінету і оновлення `last_seen_at` на запитах кабінету (не частіше раз на хвилину). Онлайн = відкрита `user_sessions` з активністю за 5 хв. Вихід ставить `revoked_at`. Інакше на `/profiles` відносний час: «щойно», хвилини, години до 48, далі дні, від 30 днів місяці, від 12 місяців роки (день/дні/днів). Підказка і рядок «Був у кабінеті» — точний час за Києвом (`src/lib/relativeTime.ts`).

## 11. З чого почати новому dev (вільні задачі)

Відкриті пункти — у беклозі. Нижче карта вже зробленого. Не чіпайте робочий topic-test без узгодження.

| Задача | Де копати | Складність | Нотатка |
| --- | --- | --- | --- |
| 6.1 Підручник + `themes.code` | `src/content/learningMaterials`, `/materials/textbook` | Середня | ✅ 08–09.09: лише підручник; `/materials` і slug → редірект |
| 6.5 Банк 30–40 / тему | `content-import` | Контент | Спочатку розширити `varchar(50)` у відповідях |
| 6.8 Варіанти НМТ | `startNmtSimulator`, `/simulator`, `nmt_variants*` | Середня | ✅ 09.09 |
| 6.6 Задачник | `src/app/problems`, таблиця `problems` | Середня | ✅ 08.09 (UI з JSON-каталогу, без MySQL на read) |
| 6.3–6.4 Діагностика | `/diagnostic` | Велика | ✅; 23.09: adaptive без самооцінки; до 10 задач; +1/−1 складність без стелі; 3 fail@1; тема ≠ попередня |
| 6.2 Відгук | `src/modules/feedback` | Мала | ✅ |
| Консультації | `/consultations` | Мала | ✅ 17.09: карусель публічних викладачів + рейтинг + персональна заявка; черга викладачів без змін |
| Мої учні | `src/modules/teacher-students`, `/students`, `/join` | Середня | ✅ 21.09: групи, інвайти 14 днів, статистика учня, «Приєднати» з консультації. 22.09: викладач створює обліковий запис учня (8.3). SQL `034`. 02.10: email валідується, лист підтвердження (24 год) або лог без `BREVO_API_KEY`; вхід не блокується, банер на `/account` |
| Призначити тест | `src/modules/mentor-assignments`, `/assign` | Середня | ✅ 17.09: мульти-учні, дедлайн, статуси зелений/рожевий, скасування й зміна списку |
| Результати учнів | `/results`, `teacherStudentResults` | Мала | ✅ 17.09: «усі учні» у випадайці, worst-first; клік по темі → середні учнів |
| Сесії учнів | `/sessions`, `teacherLearningSessions` | Мала | ✅ 17.09: усі / один учень; картки→таблиця; детальні бали без старту/скасування |
| Публічна візитка викладача | `src/modules/teachers`, `/account`, `/t/{slug}` | Мала | ✅ 13.09; адмін без візитки з 16.09 |
| Реєстрація викладача + WayForPay | `/register/teacher`, `src/modules/payments` | Середня | ⏸️ UI оплати приховано 16.09; безкоштовний teacher на `/register?role=teacher`. WayForPay код лишається |
| Email verify + reset (Brevo) | `src/modules/auth`, `src/modules/mail`, `/verify-email` | Середня | ✅ 16.09: блок логіну до verify; forgot/reset; без ключа — log. 18.09: прод-листи з `SITE_URL` / `https://nmt.in.ua`, не localhost. Підтвердження через `GET /api/auth/verify-email` (cookie в RSC давала фейкову помилку). 29.09: відправка через Brevo (`BREVO_API_KEY`), не Resend. 06.10: перший лист реєстрації повторюється в тому ж запиті, якщо токен або Brevo впали. 09.10: `/register`, учень від викладача і марафон `/join` шлють лист до `redirect()` через `node:https` (не patched `fetch`); відхилення Brevo → `?mail=failed`. Кнопка «Надіслати ще раз» лишається. AV на спільному PHP tmp ріже outbound усього акаунта — після чистки пересканувати панель |
| A11y + Select + 404/error | `SkipLink`, `Select`, `StatusScene`, Motion | Мала | ✅ 17.09: skip-link, кастомні списки, status-сторінки |
| Перф (TTFB / бандл) | `(app)`/`(marketing)` layouts, `catalogCache`, `sampleRandomIds` | — | ✅ 10.09: без `ORDER BY RAND()`, кеш довідників, cookie-профіль |
| Пагінація `/results`, `/sessions` | `src/components/ui/Pagination`, `src/lib/pagination.ts` | Мала | ✅ 10.2026: 10/стор., URL `?page=`; лише ≥768px |
| Мобільний свайпер сесій / результатів | `LearningSessionsTable`, `TopicResultsTable` | Мала | ✅ 10.2026: картки + свайп, без пагінації на телефоні |
| Лідерборд марафону | `src/modules/marathons`, `/leaderboard` | Середня | ✅ 16.10: денний курс з `marathon_day_progress` (дні, середній %, бали), порядок як `/top`. Селект: «Загальні» (`?marathon=all`, сума всіх денних) і кожен курс (`?marathon=<slug>`); без параметра — активний, інакше найновіший. Старий `kind=leaderboard` лишає сесії тренажера і в суму не входить |
| 8.4 Денний марафон | `src/modules/marathons/daily`, `/marathon/[slug]`, `/admin/marathons`, `docs/marathon.md` | Середня | ✅ Меню: `cabinet_scope` (`full` / `marathon`) у `access.ts`. Завдання до здачі — `playTasks.ts` (`PENDING_TASK_SQL`). SQL `040` + `041`. 21.10: хронологія розсилок в адмінці (шеврон, кольорові статуси, фільтр; `error_text`/`hold_reason` у `047`), тексти учасника групами з пошуком. Міграція `047_marathon_message_timeline.sql` (бекап перед продом). Картка: шестірня «Налаштування», «Активувати» / «Деактивувати», «В архів» (окрема секція; бали лишаються в лідерборді, нової міграції немає — `archived` уже в `040`). Дозвіл `marathon:manage` (зараз admin). 09.10: вступ і канал на карті; день у боті (`botPlay.ts` / `botGateway.ts`); тексти в `marathon_copy`. Контент у чаті: `telegramContent.ts`, формули MathJax + resvg-wasm. 10.10: таблиця місць `leaderboard.ts`. 12.10: cron — GitHub Actions (`.github/workflows/marathon-cron.yml`). 15.10: година нагадування і вікно nudge в адмінці; кілька марафонів в одному чаті. 16.10: з меню бота прибрано «Пройти тестування»; нижнє меню `ReplyKeyboardMarkup` (`src/modules/telegram/replyKeyboard.ts`). Хостовий cron: `scripts/hosting-telegram-cron.sh`. 16.10: active→finished після останнього дня, день без завдань не сповіщає, один канал доставки. 16.10: сторінка каналу показує прив’язку бота; після збереження — поточний день і тост; одне підтвердження `bot_registered` у Telegram. 16.10: реєстрація дає повний кабінет; лист і Telegram незалежні; картка на головній; відмова в `marathon_declines`; дзвіночок `user_notifications` (`notifyUser`). 16.10: спільні канали на `/account` (`user_channel_preferences`); запрошення при активації за `invite_audience`. Env і `MARATHON_CRON_SECRET` — `docs/marathon.md`. 16.10: завдання в боті — одне повідомлення (`taskRender.ts`). 19.10: загадки лендінгу — спільний банк `riddle_bank` (міграція `046`), квіз без ключа в HTML, кулдаун 10 с у cookie `nmt_riddle`. 19.10: форма `/admin/marathons` — акордеон секцій у `SettingsAccordion` (стан у localStorage). 19.10: воронка в картці посилання (`MarathonFunnelStrip`); набір тесту дня — `taskBank.ts` + `DayTaskBank` (тема з `themes`/`quiz_tasks`, без ключа в добірці). 21.10: картка списку показує цифри одним запитом (`cardStats.ts`): учасники, Telegram, здачі поточного дня, завершили, середній бал і % проходження, день N з M (у чернетки дата старту), час наступної розсилки з хронології. Архів — підсумок без наступної відправки. 22.10: `GET /api/marathon/stats?marathon=slug` за наявним `MARATHON_CRON_SECRET` (учасники, Telegram, дні, відсів, звернення, помилки доставки за 24 год) і та сама воронка на картці списку. Нової міграції немає. 22.10: пульс крону — `marathon_cron_heartbeat` (міграція `050`, бекап перед продом). `GET /api/marathon/notifications/health` з тим самим Bearer: `ok`, якщо успішний process був за останні 25 хв. Бейдж на `/admin/marathons`. |
| Досягнення | — | Середня | Відкрито. 16.10 заглушки з `/account` знято; окремого модуля ще немає |

Карта app router: `src/app/page.tsx` — `/` (гість легкий / учень → CabinetHome); `src/app/(marketing)/` — welcome / login / register / diagnostic / `t/[slug]`; `src/app/(app)/` — кабінет (`force-dynamic`). Root layout лише `html`/`body` + `globals.css`. Неіснуючий публічний шлях на кшталт `/welcome/немає` дає кастомний 404; випадковий `/foo` без сесії — редірект на `/login` (auth-guard).

Поза першим релізом (не хапати «бо цікаво»): CRM викладача, окремий блок ДЗ, PDF, Google-логін, AI-перевірка, типи завдань окрім вибору з 4 варіантів, повноцінний PWA. Іменовані групи й інвайти — MVP на `/students` (21.09), без CRM. Це версія 2 — питайте PM.

Локально перевірити групи: `mysql … < scripts/sql/034_student_groups_invites.sql` (або відкрити `/students` — lazy `ensureTeacherStudentsSchema` створить таблиці). Зайди викладачем: створити групу, особистий і груповий код. Учнем: `/join/КОД` (гість спочатку потрапляє на логін, код у шляху зберігається). Другий груповий код замінює групу. На `/consultations` кнопка «Приєднати».

### Telegram Tasks API (TG-003)

TG-005–TG-008 реалізовано: `/done`, деталі й підтвердження завершення, ledger сповіщень та захищений POST trigger із GitHub Actions schedule. Потрібні чинні схеми (журнал доставки створює `ensureTelegramSchema`) і серверні `TELEGRAM_*` та `DB_*`. Невизначена доставка лишається `sending` і автоматично не повторюється (скидає оператор); підтверджена відмова повертає `ready` і повторюється одразу. TG-011–TG-016 (меню, нагадування, `/stats`, сповіщення вчителя, налаштування, міграція 042) живуть у `src/modules/telegram`. Нижнє меню бота — `replyKeyboard.ts`: ті самі дії, що інлайн-меню, плюс «🏠 Головне меню». Сповіщення не змінюють стан завдань. Галочка «Основне → Telegram» на `/account` вимикає ці Telegram-повідомлення цілком; тихі години і дрібні галочки бота лишаються додатковим фільтром проактивних відправок (завдання, день марафону, нагадування, зміна місця, системна черга). Відповідь на webhook (`trigger: "user"`: меню, callback, команда, матеріали, які відкрив учасник) іде одразу, навіть у тихі години. Прив’язка бота марафону і акаунта — один стан `getTelegramLink`. Відв’язка (`unlinkTelegramAccount`) знімає обидва записи разом, інакше наступне читання відновлює чат. Кнопка на `/account`, на карті марафону і в `/profiles` для чужого акаунта; у боті `/stop` або «Відв’язати». «Зупинити сповіщення» лишається паузою. Прогрес не видаляється. Нової міграції немає.

Read-only сервіс `src/modules/telegram/tasks.ts` приймає Telegram identity, а не application userId. Прив'язка через `user_telegram_accounts` визначає власника; джерело даних — наявні таблиці сесій і завдань. DTO не містить правильних відповідей чи секретів. Міграція для TG-003 не потрібна. `TELEGRAM_*` залишаються опційними: без них сайт працює, але `/account` не генерує Telegram link. Webhook після ввімкнення: `https://nmt.in.ua/api/telegram/webhook`. Контракт фільтрації — у `src/modules/telegram/tasks.ts`. Завдання в боті (практика і день марафону) збирає `src/modules/telegram/taskRender.ts`: одне повідомлення, проста формула текстом, складна — одним фото.

## 12. Як здати роботу

- PR у `dev`, не в `main`. Назва: `feat: …` / `fix: …` / `docs: …`. У `dev` потрібен один approve.
- У `main` мерджать `tony-kobs` і `groteskzp` (Валентин Бурий), і лише pull request з `dev`. Це одразу деплоїть хостинг.
- У тілі PR заповни шаблон: для команди, для учня і викладача, скрінкаст. Звідси оновлюються журнал і §4.4. Окремо в тексті PR: як перевірити і чи потрібна міграція БД (зазвичай ні — багато таблиць lazy; Stage 2 і індекси — виняток).
- Не коміть `.env`, ключі, `.next`, великі бінарники без потреби.
- UI: порожній стан, помилка, вузький екран. Не здавай лише «у мене на 1440 ок».
- Якщо чіпаєш і фікс, і нову фічу — краще два PR.

Повний беклог продукту: [Goldener-Rechner-beklog-PM.md](./Goldener-Rechner-beklog-PM.md).

## 13. Перший прохід по сайту (щоб склалося в голові)

1. Відкрий `/` як гість — лендінг. Спробуй `/diagnostic` без логіну.
2. Зареєструй / зайди як учень. На `/` обери тему, Старт → `/session/[id]`. Заверши, глянь підсумок, `/results` і `/sessions` — цифри мають збігатися.
3. Якщо після SQL 026–031 є каталог: на `/` вкладка інтерактивних форматів (`?tab=interactive`). Інакше вкладки немає — це нормально.
4. Відкрий `/simulator` — це **інший** банк і `NmtTrainer` (`session_type` 4).
5. Вийди, зайди як викладач: редірект на `/assign`. На `/students` додай або створи учня, признач тему «на зараз», на `/results` і `/sessions` обери «усі учні». На `/account` заповни візитку, відкрий `/t/{slug}` інкогніто.
6. Зайди як адмін (`node scripts/promote-admin.mjs <login>`): `/` — список завдань теми, не тренажер. Глянь `/settings`, `/feedback`, `/profiles`. Не імпортуй випадковий файл у спільну базу без узгодження.

## TG-008 — запуск сповіщень

Реалізовано захищений POST trigger і GitHub Actions schedule кожні 5 хвилин + workflow_dispatch на main для основного хостингу ukraine.com.ua. Потрібен окремий TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET у runtime та GitHub Secrets і чинні налаштування Telegram. Журнал доставки створює `ensureTelegramSchema`. Production scheduler ще не запускався; TG-009 заплановано.
