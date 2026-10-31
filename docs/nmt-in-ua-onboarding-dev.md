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

Merge в `main` запускає [`.github/workflows/deploy-hosting.yml`](../.github/workflows/deploy-hosting.yml): Actions збирає Next, переписує шляхи runner у `.next`, кладе tar на хостинг. У tar, крім `src/`, є `scripts/migrate.mjs`, `scripts/migrate-sql.mjs`, `scripts/schema-lock.mjs` і `scripts/sql/`. Сервер у `releases/<sha>` ставить `npm install` (`mysql2` з production-залежностей), потім `npm run migrate`, і лише після успішної міграції міняє `www`. Процес Node після цього піднімає панель (reload API), не скрипт деплою. Секрет `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (якщо є) потрапляє в збірку і в env хоста; без нього job лише попереджає. На хості `npm run build` не запускаємо (старий glibc).

Розробнику на хостинг ходити не треба і **не деплоїти самостійно**. Секрети, відкат і що не робити на хості: [`.cursor/rules/deploy-hosting.mdc`](../.cursor/rules/deploy-hosting.mdc).

### 4.2. Правило шарів у коді

- `src/app/` — тонкі сторінки: metadata, рендер, виклик action. Без бізнес-логіки.
- `src/modules/` — уся логіка: тести, імпорт, рекомендації, auth, сесії.
- `src/components/` — UI. Стилі — CSS Modules поруч із компонентом.
- `src/lib/db/mysql.ts` — єдине місце, звідки ходимо в MySQL (`getConnection`).

**Нове правило:** `userId` у Server Actions береться з auth-модуля, ніколи з FormData. Інакше учень A побачить сесії учня B. Cookie лише впізнає сесію. `requireUser` / `requireRole` / `optionalLiveUser` і «гарячі» дії через `requireSessionUserId()` читають роль і бан з `app_users` (один раз на запит, `readLiveAccount`). Забанений або зниклий акаунт іде на `GET /api/auth/clear-session`. `getCurrentUser` лишає профіль з cookie для дешевих читань; захищені сторінки його не вважають джерелом ролі. Проксі теж лишається дешевою перевіркою cookie: повторна перевірка — у серверному шарі. Бан і зміна ролі (`scripts/promote-admin.mjs`) відкликають усі `user_sessions` цього користувача.

Групи маршрутів:

- `src/app/(home)/page.tsx` — `/`: гість — лендінг; учень — `CabinetHome`; викладач → `/assign`; адмін — редактор банку. Група `(home)`, щоб `loading.tsx` не обгортав кореневий `not-found`.
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

Опис pull request — джерело журналу. Дія [`.github/workflows/changelog.yml`](../.github/workflows/changelog.yml) додає коміт у гілку цього PR на `dev`: оновлюються [`docs/changelog.md`](./changelog.md) і блок нижче. У `dev` це потрапляє разом із мерджем PR, без окремого push. Той коміт не стартує дію вдруге. Новий коміт людини в гілці PR оновлює журнал знову; якщо гілка ще без цієї версії workflow, достатньо змінити опис PR. Скрінкаст з’являється тут лише після галочки «схвалено показувати». Коли відкривають реліз `dev` → `main`, дія відкриває ще один PR у `dev` із рядками для новин. Поки реліз відкритий, push у `dev` оновлює ці новини.

<!-- changelog:wiki -->
- **31 жовтня 2026** — [fix: 404 замість 200, імена в таблиці і форми «день/дні/днів»](https://github.com/tony-kobs/nmt.in.ua/pull/281). Три правки з передрелізної перевірки. 1. **HTTP 404.** Кореневий `loading.tsx` (і такі самі файли в `(marketing)` та `(app)`) створювали Suspense і стримили відповідь з кодом 200 ще до `notFound()`. Стилізована сторінка 404 з `noindex` лишалась, але статус був 200. Екрани завантаження перенесені в групи маршрутів, які не кличуть `notFound()`: `(home)` для `/`, `(flow)` для звичайних публічних сторінок, `(cabinet)` для кабінету без «немає такого запису». Для `/marathon/[slug]` перевірка slug (невідомий, архів, не денний курс) стоїть у layout до дочірнього `loading.tsx`, тож справжній курс і далі показує завантаження, а відсутній — 404. 2. **Таблиця місць на 375.** `overflow-wrap: anywhere` рвав імена посеред слова («Narrin|a», «Михай|ло М.»), бо колонка балів забирала всю ширину. На base ім’я і бали йдуть двома рядками, перенос лише між словами. З 768 знову три колонки, ім’я не вужче за 8rem. 3. **Числівники.** `landingLead` і інші лічильники в `uk.json` (бали, завдання, оцінки, рази, відгуки, акаунти) переведені на ICU `one/few/many/other`. Те саме для en/de, де форма однини відрізнялась («1 free day», «1 Punkt»). «Немає днів: {days}» не чіпалось: там список номерів днів, не лічильник. Перевірка: `npm run lint` (лише два давні warning), `npm test` (1615 пройшли, 4 пропущені), `npm run build`, далі `next start`. `curl`: `/welcome` і `/login` — 200; `/welcome/no-such-page`, `/marathon/math-5`, `/marathon/pilot`, `/marathon/no-such-slug`, `/t/no-such-teacher`, `/marathon/onemath/join`, `/session/abc` — 404 і `noindex`. Для гостя `/no-such-page-at-all` як і раніше редірект на логін (auth-guard); з сесією — 404. На локальній порожній базі завершений курс віддав «Безкоштовні 3 дні» і «23 бали». Знімки 375 / 768 / 1240: імена цілі, на 768 і 1240 рядок лишається в три колонки. Прод, env і міграції не змінювались.
- **30 жовтня 2026** — [fix: публічна сторінка марафону до старту — парковка, не 404](https://github.com/tony-kobs/nmt.in.ua/pull/272). `/marathon/{slug}` більше не віддає 404, якщо денний курс уже є в базі, але ще не відкритий. Правила ті самі поля, що вже є: `status`, `start_date`, `unlock_hour`. - Чернетка — парковка: назва, опис (якщо є), час старту, «Долучитись». - Активний до відкриття дня 1 (`start_date` + `unlock_hour`, Київ) — та сама парковка. Долучитись можна. - Активний без читабельної дати старту — теж парковка. Раніше такий рядок зникав із читання, тож сторінка була 404, а заголовок лишався «Математичний марафон». - У час старту активного курсу — колишній лендінг із загадками і «Долучитися». - Завершений — таблиця місць, як на `onemath`. - Архів і невідомий slug — 404 із заголовком «Сторінку не знайдено». «Долучитись» — наявна реєстрація `/marathon/{slug}/join` або приєднання увійшлого. До відкриття людина повертається на парковку. Після старту — на карту. Sitemap бере чернетку, активний і завершений денний курс. Архів не входить. Перевірити ширини 375 / 768 / 1240 на парковці, відкритому лендінгу, завершеному курсі і на невідомому slug.
- **30 жовтня 2026** — [Навчальні сесії викладача: список завдань перед призначенням](https://github.com/tony-kobs/nmt.in.ua/pull/280). Викладач більше не призначає «тему і рівень» наосліп. З’явилась навчальна сесія: назва, тема, рівень і впорядкований список завдань з `quiz_tasks`. - Завдання можна зібрати вручну, добрати випадково за темою і рівнем або змішати. - Сесію можна правити. Якщо її вже призначено, зберігання попереджає: новий список отримають учні, які ще не відкрили тест. Хто вже почав, лишається зі своїми завданнями. Тему активної сесії не змінюємо. Сесію з призначеннями не видаляємо. - Призначення — окремий крок: готова сесія, учні, відкрити зараз або з дати, дедлайн. Ту саму сесію можна призначити ще раз іншим учням і в інший час. - Швидке призначення за темою і рівнем лишилось. Воно само створює сесію і фіксує в ній добірку. - Старт учня (`startPlannedSession`) бере цей список у збереженому порядку. Старі авто-сесії без викладача як і раніше набираються з банку. - Клік по картці в «Призначені тести» показує завдання сесії, ключ і пояснення. Таблиці: `sessions`, `session_tasks`. У `mentor_assignments.session_id` — ця сесія. `mentor_assignment_members.session_id` як і раніше вказує на спробу учня в `task_sessions`. Колонка `sessions.legacy_assignment_id` потрібна лише бекфілу. Статистика учня по кожному завданню в цей PR не входить. ### Міграція на проді Перед викладкою зняти бекап бази. Потім прогнати міграцію вручну в каталозі релізу: ```bash npm run migrate ``` Файл `scripts/sql/062_teacher_learning_sessions.sql` для кожного наявного призначення без сесії створює сесію з тими завданнями, які учень уже отримав. Якщо кілька учнів отримали різні випадкові набори, береться спроба з найменшим `tasks2session.id`. Інші спроби не переписуються. Якщо ще ніхто не почав, сесія фіксує перші N завдань теми і рівня за `quiz_tasks.id` (N = `tasks_number`, не більше 200). Далі старт учня бере цей список. Деплой теж виконає файл, якщо його ще немає в `schema_migrations`. Тому бекап має бути до викладки, а не після.
- **29 жовтня 2026** — [feat: задача з банку і імпорт Word у підручник](https://github.com/tony-kobs/nmt.in.ua/pull/279). Редактор `/admin/textbook/[code]` лишає панель блоків, картинки, живу чернетку, шаблон теми, автозбереження і історію версій з #277 і #278. Додано два способи швидше збирати розділ. ### Задача з банку Кнопка «Задача з банку» шукає за кодом теми, назвою або текстом у трьох банках, які вже є на сайті: - `quiz` — `quiz_tasks` (тест за темою, А–Г); - `nmt` — `nmt_quiz_tasks` (А–Д, логічні пари через `nmtMatch` / каталог, відкрита числова відповідь, малюнок у умові); - `problem` — `problems` (задачник). У розмітку лишається живе посилання `:::task nmt:17`. Правка в банку видна в чернетці і в учня без повторної публікації самого тексту завдання. Картка — та сама `TestTaskCard`, для пар — `NmtMatchTask` без відправки. Ключ і пояснення ховаються за «Показати відповідь». Хибний рядок і видалений id пишуться в список помилок. Учень при цьому бачить решту розділу, без дірки замість картки. Адмін у чернетці бачить попередження. ### Імпорт Вставка HTML з Word або Google Docs і кнопка «Імпорт» для `.docx` переносять заголовки, абзаци, жирний / курсив, списки і таблиці (`:::table`). Картинка з документа йде через той самий `saveTextbookImage`: SHA-256 і дедуп у `textbook_images`. Після імпорту — короткий підсумок, що перенеслось і що треба глянути. Звичайний текст з буфера лишається як був. Формули: - MathML і анотація `application/x-tex` (Google Docs, HTML Word) — `mathml-to-latex`; - OMML у `.docx` mammoth викидає, тому перед цим рівняння переписується в LaTeX (дріб, степінь, корінь, дужки, сума, матриця, назва функції); - те, що не зібралось, лишається міткою `⟦формула⟧` / `⟦картинка⟧` / `⟦таблиця⟧` і рядком у списку помилок, а не зникає мовчки. Залежності: `mammoth` (docx → HTML, без нативних додатків), `mathml-to-latex` (малий перетворювач MathML), `node-html-parser` (обхід HTML у тестах без jsdom), `fflate` (розпакувати docx, щоб переписати OMML до mammoth). `mammoth` у `serverExternalPackages`. ### Міграція Нової нема і `062` не додавався. Посилання живе в тексті розділу, завдання лишаються у своїх таблицях, картинки — у вже існуючій `textbook_images` (`060`). Прод-базу, env і конфіг деплою не чіпав. Міграцію ні на яку базу звідси не запускав. ### Як перевірити локально Увійти адміном і відкрити `/admin/textbook/ALG-08-FRACTIONS`. 1. «Задача з банку» — ввести код теми, фрагмент умови або id. Обрати рядок: у полі з’явиться `:::task quiz:…`, `nmt` або `problem`. У «Чернетці» — картка з варіантами А–Д. «Показати відповідь» відкриває ключ і пояснення, якщо воно є. 2. Замінити id на неіснуючий. У списку помилок — рядок про відсутню задачу, у чернетці — попередження. Після «Опублікувати» учень на `/materials/textbook?topic=ALG-08-FRACTIONS` бачить розділ без зламаної картки. 3. Скопіювати з Word або Google Docs абзац, список, таблицю і формулу — вставити в поле. Або «Імпорт» і файл `.docx`. Під полем — підсумок. Звичайний текст без оформлення вставляється як раніше. 4. Ширини: 375 / 768 (вкладки), 1240 / 1440 / 1920 (поле і чернетка поруч). Кнопки від 44px. Картка без фіксованої висоти. ### Обмеження - Нумерований список стає маркованим: у розмітці один вид списку. Заголовки глибші за підзаголовок зводяться до `«## »`. Підсумок про це каже. - Зовнішнє посилання на картинку не вантажиться (щоб сервер не ходив за чужим URL). Лишаються вбудовані байти з docx і data-URL, плюс файл картинки з буфера. - Складна OMML-конструкція, якої немає в обхіднику, і формула-картинка без LaTeX лишаються на ручну правку. - Ключ завдання є в даних сторінки підручника: це навчальний розділ, не контрольна. Пошук і розв’язання id доступні лише адміну. - Кабінет у цьому середовищі не відкривався: немає `DB_HOST`, і сторінку адміна не викликав, щоб не писати в базу. Lint: 0 помилок, 2 старі warning. Тести: 1595, 1591 pass, 4 skip, 0 fail. `next build --webpack` зелений.
- **29 жовтня 2026** — [feat: шаблон теми і автозбереження чернетки підручника](https://github.com/tony-kobs/nmt.in.ua/pull/278). Редактор `/admin/textbook/[code]` легше збирати з нуля і важче втратити текст. - **Шаблон нової теми.** Порожнє поле одразу пропонує каркас: «Теорія», «Формули», «Приклад», «Типові помилки», «Задачі НМТ». Два варіанти. «Алгебра» — для кодів на кшталт `ALG-` і `MATH-`. «Геометрія» — для `GEO-`, у теорії є сітка `:::paper 12 12`. Задача в обох шаблонах з кириличними А–Д і ключем «Б»; числа в варіантах різні і збігаються з обчисленням. Кнопка «Вставити шаблон» є завжди. Якщо в полі вже є текст, заміна лише після підтвердження. Опублікований розділ від цього не змінюється. - **Автозбереження чернетки.** Через 3 с після паузи в наборі чернетка пишеться сама. Біля кнопок статус: «Збереження…», «Збережено о 20:41» (час за Києвом) або помилка. Поки їде картинка, запис чекає. Текст ще й лежить у `localStorage` цієї вкладки. Якщо закрити вкладку з незбереженим текстом, браузер питає підтвердження. Відкриття сторінки саме по собі в базу нічого не пише: статичний конспект лишається лише в полі, доки його не змінити. - **Дві вкладки.** У рядка теми є `draft_revision`. Запис проходить, лише якщо версія збігається з тією, яку вкладка бачила. Інакше текст на сервері не затирається, а в полі лишається попередження: «Взяти збережене» або «Перезаписати збережене моїм текстом» (друге теж із підтвердженням). - **Історія версій.** Кожне «Опублікувати» додає знімок. Під формою список «Історія версій»: хто, коли за Києвом, «Перегляд» і «Відновити». Відновлення кладе текст **у чернетку**, не публікує його знову. Учень бачить попередній опублікований розділ, доки адмін сам не натисне «Опублікувати». Так випадковий клік по старій версії не змінює сайт. Кнопки блоків, жива чернетка, перетягування і вставка картинки, «Зберегти чернетку» і «Опублікувати» лишились. ### Міграція Новий файл `scripts/sql/061_textbook_section_versions.sql`: - колонка `textbook_sections.draft_revision` (ціле, старт 1); - таблиця `textbook_section_versions` (`theme_code`, `body`, `created_by`, `created_at`). **Перед продом — бекап бази.** Міграцію застосує деплой (`npm run migrate`) до swap. Цим PR прод-базу, env і конфіг деплою не чіпали. Міграцію на жодну базу звідси не запускали. ### Як перевірити локально Увійти адміном і відкрити `/admin/textbook/ALG-08-FRACTIONS`. 1. «Вставити шаблон» → «Алгебра». Має запитати підтвердження, бо в полі вже є конспект. Після згоди в чернетці п’ять розділів і задача А–Д. За кілька секунд — «Збережено о …». Учень на `/materials/textbook?topic=ALG-08-FRACTIONS` досі бачить старий текст. 2. «Опублікувати». У «Історії версій» з’являється запис. «Перегляд» показує розмітку. «Відновити» повертає її в поле і не змінює те, що бачить учень, доки не опублікувати ще раз. 3. Для порожньої теми (без конспекту і без рядка в базі) шаблон пропонується одразу, без питання. Код `GEO-…` підсвічує «Геометрія» і сітку. 4. Дві вкладки однієї теми: набрати в другій і зачекати збереження, потім у першій — має з’явитись попередження, а не тихий перезапис. 5. Ширини: 375 / 768 (історія стовпчиком), 1240 / 1440 / 1920 (редактор і чернетка поруч). Кнопки від 44px. Lint: 0 помилок, 2 старі warning. Тести: 1584, 1580 pass, 4 skip, 0 fail. `next build --webpack` зелений. Кабінет у цьому середовищі не відкривався: немає `DB_HOST`, і сторінка адміна не викликалась, щоб `ensure*` не писав у базу.
- **29 жовтня 2026** — [feat: легше збирати розділ підручника](https://github.com/tony-kobs/nmt.in.ua/pull/277). Редактор `/admin/textbook/[code]` більше не змушує пам’ятати розмітку руками. - Над полем кнопки «Заголовок», «Підзаголовок», «Список», «Формула», «Таблиця», «Сітка», «Графік», «Картинка», «Задача», «Примітка» і «З файлу». Вони вставляють готовий блок у курсор. Виділений один рядок формула обгортає як `\(...\)`. У шаблоні задачі літери відповіді кириличні А–Д, ключ «Б» для `2 + 3`. «Як писати» лишилось розкривним підказом синтаксису. - Картинку можна перетягнути на поле, вставити Ctrl+V або обрати файлом. Поки файл їде, у тексті стоїть позначка «Завантаження…», після відповіді вона замінюється на `![Зображення](/api/textbook-media/<sha256>)`. Помилка типу або розміру лишається біля поля, позначка зникає. Приймаються PNG, JPEG, WebP і GIF до 2 МБ, за байтами, не за заголовком. SVG відхиляється: з цього ж походження його можна відкрити як сторінку зі скриптом. Однаковий файл пишеться один раз: `content_hash` — SHA-256, як дедуп шляхів у `058`, тільки для нових завантажень. - Зліва поле, справа жива «Чернетка» (оновлення з паузою ~280 мс, KaTeX як у учня). З 1240 дві колонки, вужче — вкладки «Редактор» / «Чернетка». Зламана формула підсвічується в перегляді і списком біля поля (незакритий `\(` / `:::table` / `:::paper` і хибний шлях картинки теж). «Як бачить учень», чернетка і «Опублікувати» лишились. - Нова міграція `scripts/sql/060_textbook_images.sql`: таблиця `textbook_images`. Каталог релізу на деплої стирається, тож байти в `public/` не пережили б викладку (так само, як фото марафону). Перед продом — бекап бази. Прод-БД, env і конфіг деплою цим PR не змінювались. Міграцію на жодну базу звідси не запускали. Як перевірити локально: увійти адміном і відкрити `/admin/textbook/ALG-08-FRACTIONS`. Натиснути «Формула», «Таблиця», «Сітка», «Задача». Перетягнути PNG на поле або вставити з буфера. Набрати `\[ \frac{ \]` і побачити рядок у списку помилок і червону формулу в чернетці. «Зберегти чернетку» і «Опублікувати» працюють як раніше. Ширини: 375 і 768 (вкладки), 1240 / 1440 / 1920 (дві колонки). Скріншоти з цього середовища не зняті: немає `DB_HOST` і сесії адміна, тож кабінет не відкривається. Lint: 0 помилок, 2 старі warning. Тести: 1573, 1569 pass, 4 skip, 0 fail. `next build --webpack` зелений.
- **28 жовтня 2026** — [fix: підручник не публікує статичний конспект сам](https://github.com/tony-kobs/nmt.in.ua/pull/274). Читання розділу більше не пише `published_body`. Учень бачить статичний `getTextbookBlocks`, доки адмін сам не натисне «Опублікувати». Порожній `published_body`, збій бази або відсутня таблиці теж повертають конспект. Раундтріп зроблено без втрат, а не заблоковано публікацію. Адмін може відкрити існуючу тему, правити її і опублікувати. Складні таблиці йдуть блоками `:::table` / `:::paper`: лишаються розмір сітки, layout, `colSpan` і картинка в клітинці. Тест проганяє всі `textbookThemeCodes()`. У редакторі два перегляди: «Чернетка» і «Як бачить учень». Напис каже, чи зміни ще не опубліковані. Тексти є в uk, en і de. Якщо на dev перше відкриття вже записало втратну копію, її знімає `scripts/clear-textbook-autoseed.mjs`. Без `--yes` лише план. Рядок видаляється, лише коли `published_body` дорівнює знімку й чернетка та сама. Якщо чернетку вже правили, очищається лише опублікація. Скрипт на жодну базу з цього PR не запускався. Lint: 0 помилок, 2 старі warning. Тести: 1555 pass, 4 skip, 0 fail. `next build --webpack` зелений.
- **28 жовтня 2026** — [fix: бренд-іконка у вкладці замість трикутника Next](https://github.com/tony-kobs/nmt.in.ua/pull/273). Вкладка брала `app/favicon.ico` — чорний трикутник з ініт-коміту. Знак LevelUP лежав у `public/favicon.png` (120×120), а маніфест називав його `image/svg+xml`. - `src/app/favicon.ico` прибрано, щоб Next не додавав другий `<link rel="icon" sizes="16x16">`. - `/favicon.ico` — 16, 32 і 48 зі знака. Окремого вектора в репо не було, тож контури зняті з PNG 120 і лежать у `public/brand/levelup-mark.svg`. 16 і 32 зібрані різко, без сірої каші на краях. - PNG 32 / 192 / 512, Apple Touch 180, maskable 192 і 512. Папір maskable і Apple — `#efe8d7`. - У head один набір: ico, png 32, png 192, apple-touch. Маніфест — лише PNG з явними розмірами. Перевірено: lint, тести, build. На `/`, `/welcome`, `/login` і `/diagnostic` у `<head>` одні й ті самі лінки. `/favicon.ico` віддає три розміри, `/manifest.webmanifest` — 192 і 512.
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
| `src/app/(app)/assign/` | Призначити тест і навчальні сесії викладача (teacher/admin). Редактор: `/assign/sessions/new`, `/assign/sessions/[id]` |
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
| `src/modules/testing/` | Старт, checkAnswer, finish, симулятор, таймер. Логічні пари НМТ: `nmtMatch.ts` + `nmtMatchCatalog.json` (рядки 1–3 і варіанти А–Д, якщо в банку лише літери) |
| `src/modules/stage2/` | Інтерактивні формати (окремі таблиці, не `task_sessions`) |
| `src/modules/diagnostic/` | Публічна діагностика гостя/учня (окремо від topic-test) |
| `src/modules/problemGenerators/` | Чисті генератори (без БД); зараз `fractionAddition` |
| `src/modules/fractionPractice/` | Server Actions для `/practice/fractions` — без запису в сесії БД |
| `src/modules/recommendations/` | Статистика, правила, граф тем, авто-сесії |
| `src/modules/sessions/` | Список сесій, createMentorSession, сесії класу викладача |
| `src/modules/results/` | Агрегати `/results` + `teacherStudentResults` |
| `src/modules/mentor-assignments/` | Групове призначення тестів (`/assign`) |
| `src/modules/teacher-sessions/` | Навчальна сесія викладача: назва, тема, рівень, порядок `quiz_tasks`. Швидке призначення створює сесію саме |
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
| `nmt_variants` / `nmt_quiz_tasks` / `nmt_variant_tasks` | Офіційні варіанти симулятора | **Не** змішувати з `quiz_tasks`. SQL `011`–`013`. Старий імпорт matching клав у `answer_1..5` лише літери А–Д. Показ добирає `nmtMatchCatalog.json`. Дозапис у базу — окремо `node scripts/backfill-nmt-match.mjs` (типово dry-run; `--apply` лише після бекапу на копії). Скрипт не читає `.env.production` і не входить у `npm run migrate` |
| `task_sessions` | Спроба учня | `session_type` 1 user / 2 auto / 3 mentor / 4 NMT / **5 diagnostic**; status 1 done / 2 created / 3 planned. `user_id` і `theme_id` nullable + `guest_token`. `expire_time` — фіксований дедлайн 24 год від створення рядка |
| `tasks2session` | Мапінг завдання↔сесія | `status` 0 / 1 / −1; той самий owner, що в сесії |
| `site_feedback` | Відгук про сайт | `score` 1–10; `message` обов’язкове якщо score < 5. Після збереження адміни отримують `user_notifications` (`admin.feedback`) і лист; категорії `user_channel_preferences` на ці алерти не діють. Збій сповіщення не відкочує відгук |
| `consultation_requests` | Заявки на консультацію | один відкритий запит на учня. `019` |
| `user_self_scores` | Самооцінка, **історія** | рівно один з `user_id` / `guest_token`; `score` 1–10. `007` |
| `teacher_students` | Roster | unique pair викладач↔учень. `017` |
| `student_groups` / `student_group_members` / `student_invites` | Групи й інвайти | одна група на викладача на учня; код 14 днів. `034` |
| `mentor_assignments` / `mentor_assignment_members` | Групове ДЗ | тема + `due_at`. `mentor_assignments.session_id` — навчальна сесія викладача (`062`). `mentor_assignment_members.session_id` — спроба учня в `task_sessions`. `033` |
| `sessions` / `session_tasks` | Список завдань викладача | `title`, `theme_id`, `difficulty`, `origin` manual/quick/migrated, порядок `quiz_task_id`. Не плутати з `task_sessions` і `user_sessions`. `062`. Бекап перед продом, далі `npm run migrate` |
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
| Ментор-сесія | викладач на `/assign` | список навчальної сесії, інакше до 10 випадкових | `session_type = 3`; `mentor_assignments.session_id` фіксує завдання. Старт учня бере цей порядок |
| Діагностика | `/diagnostic` (публічний) | до 10; стоп при 3 fail@1 | `session_type = 5`, `theme_id = NULL`; без самооцінки перед темами |
| Stage 2 | `/?tab=interactive` | раунд 20 задач | Окремі таблиці; одна повторна спроба, потім reveal |
| Практика дробів | `/practice/fractions` | генератор, 5 рівнів | Без рядків у `task_sessions` |

`src/modules/testing/sessionMode.ts` — єдине місце, де `TrainerMode` мапиться на `diagnostic` / `practice` / `exam`. Не розмножуй `if (mode === "diagnostic")` у компонентах.

Підказка / «схоже завдання» під час topic-test **зняті з UI**. Server Actions `getTaskHint` / `addSimilarPracticeTask` лишаються. Ultimate як продукт на старті `/` знято (legacy-код режиму може ще бути).

### 6.4. Маршрути

| URL | Хто бачить | Стан |
| --- | --- | --- |
| `/`, `/welcome` | Усі. `/` — лендінг для гостя, кабінет для учня; `/welcome` завжди лендінг | Готово |
| `/login`, `/register` | Гість | Готово. Вхід за e-mail; внутрішній логін виводиться з пошти. На `/register` вибір учень/викладач (`?role=`). Email → check-email → verify |
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
| `/materials/textbook` | Учень+ | Один розділ `?topic=<themes.code>`. Опублікований текст з `/admin/textbook`; інакше статичний конспект |
| `/admin/textbook` | Лише admin | Чернетка і публікація. Читання не пише `published_body`. Кнопки блоків, живий перегляд (з 1240 поруч, вужче — вкладки), картинки в `textbook_images` (`060`). Шаблон алгебри або геометрії, автозбереження чернетки, історія публікацій (`061`, «Відновити» повертає текст у чернетку). «Задача з банку» і «Імпорт» `.docx` / вставка з Word чи Google Docs. Нової таблиці немає |
| `/problems` | Учень+ | Друкований тест по темі |
| `/account` | Учень+ | Фото / пароль / вихід. Викладач — візитка; адмін — без навчальних віджетів |
| `/assign`, `/assign/sessions/new`, `/assign/sessions/[id]` | teacher/admin (сторінка `requireRole`; учень не в меню) | Навчальні сесії і призначення. Картка призначення показує завдання |
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
| 6.1 Підручник + `themes.code` | `src/content/learningMaterials`, `src/modules/textbook`, `/materials/textbook`, `/admin/textbook` | Середня | ✅ 08–09.09: лише підручник; `/materials` і slug → редірект. 28.10: адмін публікує текст у `textbook_sections` (`059`). Учень бачить статичний конспект, доки адмін не натисне «Опублікувати». 29.10: панель блоків, картинка перетягуванням або Ctrl+V (`060`), жива чернетка, шаблон теми, автозбереження, історія публікацій (`061`), жива `:::task` з банку і імпорт Word / Google Docs |
| 6.5 Банк 30–40 / тему | `content-import` | Контент | Спочатку розширити `varchar(50)` у відповідях |
| 6.8 Варіанти НМТ | `startNmtSimulator`, `/simulator`, `nmt_variants*` | Середня | ✅ 09.09 |
| 6.6 Задачник | `src/app/problems`, таблиця `problems` | Середня | ✅ 08.09 (UI з JSON-каталогу, без MySQL на read) |
| 6.3–6.4 Діагностика | `/diagnostic` | Велика | ✅; 23.09: adaptive без самооцінки; до 10 задач; +1/−1 складність без стелі; 3 fail@1; тема ≠ попередня |
| 6.2 Відгук | `src/modules/feedback` | Мала | ✅ |
| Консультації | `/consultations` | Мала | ✅ 17.09: карусель публічних викладачів + рейтинг + персональна заявка; черга викладачів без змін |
| Мої учні | `src/modules/teacher-students`, `/students`, `/join` | Середня | ✅ 21.09: групи, інвайти 14 днів, статистика учня, «Приєднати» з консультації. 22.09: викладач створює обліковий запис учня (8.3). SQL `034`. 02.10: email валідується, лист підтвердження (24 год) або лог без `BREVO_API_KEY`; вхід не блокується, банер на `/account` |
| Призначити тест | `src/modules/mentor-assignments`, `src/modules/teacher-sessions`, `/assign` | Середня | ✅ 17.09: мульти-учні, дедлайн, статуси. 30.10: навчальна сесія (ручний набір, добір за темою і рівнем, перегляд з ключем). Одна сесія призначається кілька разів. Швидке призначення створює сесію саме. Міграція `062` — вручну після бекапу. Статистика по кожному завданню учня — пізніше |
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
| 8.4 Денний марафон | `src/modules/marathons/daily`, `/marathon/[slug]`, `/admin/marathons`, `docs/marathon.md` | Середня | ✅ Меню: `cabinet_scope` (`full` / `marathon`) у `access.ts`. Завдання до здачі — `playTasks.ts` (`PENDING_TASK_SQL`). SQL `040` + `041`. 21.10: хронологія розсилок в адмінці (шеврон, кольорові статуси, фільтр; `error_text`/`hold_reason` у `047`), тексти учасника групами з пошуком. Міграція `047_marathon_message_timeline.sql` (бекап перед продом). Картка: шестірня «Налаштування», «Активувати» / «Деактивувати», «В архів» (окрема секція; бали лишаються в лідерборді, нової міграції немає — `archived` уже в `040`). Дозвіл `marathon:manage` (зараз admin). 09.10: вступ і канал на карті; день у боті (`botPlay.ts` / `botGateway.ts`); тексти в `marathon_copy`. Контент у чаті: `telegramContent.ts`, формули MathJax + resvg-wasm. 10.10: таблиця місць `leaderboard.ts`. 23.10: розсилку піднімає процес Node (`src/instrumentation.ts`, кожні 60 с, лок `GET_LOCK`); `POST /api/marathon/notifications/process` лишається ручним. GitHub Actions `marathon-cron.yml` знято. 15.10: година нагадування і вікно nudge в адмінці; кілька марафонів в одному чаті. 16.10: з меню бота прибрано «Пройти тестування»; нижнє меню `ReplyKeyboardMarkup` (`src/modules/telegram/replyKeyboard.ts`). Хостовий cron: `scripts/hosting-telegram-cron.sh`. 16.10: active→finished після останнього дня, день без завдань не сповіщає, один канал доставки. 16.10: сторінка каналу показує прив’язку бота; після збереження — поточний день і тост; одне підтвердження `bot_registered` у Telegram. 16.10: реєстрація дає повний кабінет; лист і Telegram незалежні; картка на головній; відмова в `marathon_declines`; дзвіночок `user_notifications` (`notifyUser`). 16.10: спільні канали на `/account` (`user_channel_preferences`); запрошення при активації за `invite_audience`. Env і `MARATHON_CRON_SECRET` — `docs/marathon.md`. 16.10: завдання в боті — одне повідомлення (`taskRender.ts`). 19.10: загадки лендінгу — спільний банк `riddle_bank` (міграція `046`), квіз без ключа в HTML, кулдаун 10 с у cookie `nmt_riddle`. 19.10: форма `/admin/marathons` — акордеон секцій у `SettingsAccordion` (стан у localStorage). 19.10: воронка в картці посилання (`MarathonFunnelStrip`); набір тесту дня — `taskBank.ts` + `DayTaskBank` (тема з `themes`/`quiz_tasks`, без ключа в добірці). 21.10: картка списку показує цифри одним запитом (`cardStats.ts`): учасники, Telegram, здачі поточного дня, завершили, середній бал і % проходження, день N з M (у чернетки дата старту), час наступної розсилки з хронології. Архів — підсумок без наступної відправки. Нової міграції немає. 22.10: звернення з бота — `src/modules/support`, `/admin/support`, міграція `051_support_tickets.sql` (бекап перед продом). «❓ Допомога» пропонує «Написати команді». `public_chat_url` показується в допомозі і на вступі. Для slug `onemath` порожнє поле — `https://t.me/nmt_onemath`. Пересилання в чат команди — `TELEGRAM_SUPPORT_CHAT_ID` у store `.env.production`. Міграція групи в супергрупу пише новий id в лог і на `/admin/support`. 23.10: історія запусків `marathon_scheduler_runs` (міграція `053`, бекап перед продом). `GET /api/marathon/notifications/health` — `503`, якщо успішного тіку не було понад 5 хв. Бейдж на `/admin/marathons`. 22.10: «Змінити канал» у боті підставляє `{name}`, ставить «✓» на увімкнений канал і підтверджує вибір. Формули в боті — звичайний текст (`src/modules/telegram/latexPlain.ts`): умова, варіанти, матеріали, пояснення, розбір і підпис кнопки (до 64). `\begin{…}` лишається фото. Сайт не чіпає KaTeX. 22.10: після здачі останнього дня в боті — опитування (оцінка, що покращити, чи порадили б), тексти в групі «Фінал», відповіді на картці списку. Міграція `052_marathon_survey.sql` (бекап перед продом). `050` і `051` уже в `dev`. 22.10: `GET /api/marathon/stats?marathon=slug` за наявним `MARATHON_CRON_SECRET` (учасники, Telegram, дні, відсів, звернення, помилки доставки за 24 год) і та сама воронка на картці списку. Нової міграції немає. 23.10: у групі `TELEGRAM_SUPPORT_CHAT_ID` команда `/all` (або `/all@бот`) готує розсилку учасникам з прив’язаним Telegram, без паузи і без `/stop`. Чернетка на годину, кнопки «Надіслати» і «Скасувати». У чергу йде з `trigger: system`. Відповідь на картку звернення в групі пишеться учасником. Міграція `054_team_chat_broadcast.sql` (бекап перед продом). Нової змінної немає. 23.10: у повідомленні «Меню марафону» лишаються «🏆 Таблиця марафону» і «🌐 Загальний рейтинг», навіть коли знизу меню кабінету. Старі підписи «Таблиця» і «Загальні» відкривають ті самі екрани. Нової міграції немає. 23.10: час дня — від першого відкриття завдань (сайт і бот) до здачі (`started_at`, `submitted_at`, `duration_seconds`). У таблиці місць час лише розрулює нічию: менший загальний час вище, невідомий — нижче. Старі здачі без старту час не вигадують. Міграція `055_marathon_day_time.sql` (бекап перед продом). 23.10: фото вступу і дня (JPEG/PNG/WebP до 1,5 МБ) у `marathon_images`; бот і сайт показують його, порожнє поле нічого не міняє. `/all` з фото — `sendPhoto`, підпис довший за 1024 іде окремим текстом. Опитування показує ім’я і @нік. Хронологія порівнює id чату як числа. Міграція `056_marathon_images.sql` (бекап перед продом). 23.10: відповідь бота на звернення має заголовок, цитату питання і кнопку «Відповісти»; продовження лишається в тому самому тікеті. Міграція `057_support_ticket_thread.sql` (бекап перед продом). 23.10: час біля балів — «12 хв 05 с», від години «1 год 03 хв», без запису «—» (полиця, /leaderboard, бот «🏆 Таблиця марафону», карта, день, фініш, воронка). 28.10: `/marathon/[slug]` до відкриття дня 1 — парковка і «Долучитись»; архів і чужий slug лишаються 404. |
| Досягнення | — | Середня | Відкрито. 16.10 заглушки з `/account` знято; окремого модуля ще немає |

Карта app router: `src/app/(home)/page.tsx` — `/` (гість легкий / учень → CabinetHome); `src/app/(marketing)/` — welcome / login / register / diagnostic / `t/[slug]`; `src/app/(app)/` — кабінет (`force-dynamic`). Root layout лише `html`/`body` + `globals.css`. `loading.tsx` не стоїть поруч із кореневим `not-found` і не обгортає сторінки, які кличуть `notFound()`: інакше відповідь стримиться з HTTP 200. Неіснуючий публічний шлях на кшталт `/welcome/немає` дає кастомний 404 зі статусом 404; випадковий `/foo` без сесії — редірект на `/login` (auth-guard).

Поза першим релізом (не хапати «бо цікаво»): CRM викладача, окремий блок ДЗ, PDF, Google-логін, AI-перевірка, типи завдань окрім вибору з 4 варіантів, повноцінний PWA. Іменовані групи й інвайти — MVP на `/students` (21.09), без CRM. Це версія 2 — питайте PM.

Локально перевірити групи: `mysql … < scripts/sql/034_student_groups_invites.sql` (або відкрити `/students` — lazy `ensureTeacherStudentsSchema` створить таблиці). Зайди викладачем: створити групу, особистий і груповий код. Учнем: `/join/КОД` (гість спочатку потрапляє на логін, код у шляху зберігається). Другий груповий код замінює групу. На `/consultations` кнопка «Приєднати».

### Telegram Tasks API (TG-003)

TG-005–TG-008 реалізовано: `/done`, деталі й підтвердження завершення, ledger сповіщень та захищений POST trigger із GitHub Actions schedule. Потрібні чинні схеми (журнал доставки створює `ensureTelegramSchema`) і серверні `TELEGRAM_*` та `DB_*`. Невизначена доставка лишається `sending` і автоматично не повторюється (скидає оператор); підтверджена відмова повертає `ready` і повторюється одразу. TG-011–TG-016 (меню, нагадування, `/stats`, сповіщення вчителя, налаштування, міграція 042) живуть у `src/modules/telegram`. Нижнє меню бота — `replyKeyboard.ts`: ті самі дії, що інлайн-меню, плюс «🏠 Головне меню». Сповіщення не змінюють стан завдань. Галочка «Основне → Telegram» на `/account` вимикає ці Telegram-повідомлення цілком; тихі години і дрібні галочки бота лишаються додатковим фільтром проактивних відправок (завдання, день марафону, нагадування, зміна місця, системна черга). Відповідь на webhook (`trigger: "user"`: меню, callback, команда, матеріали, які відкрив учасник) іде одразу, навіть у тихі години. Прив’язка бота марафону і акаунта — один стан `getTelegramLink`. Відв’язка (`unlinkTelegramAccount`) знімає обидва записи разом, інакше наступне читання відновлює чат. Кнопка на `/account`, на карті марафону і в `/profiles` для чужого акаунта; у боті `/stop` або «Відв’язати». «Зупинити сповіщення» лишається паузою. Прогрес не видаляється. Нової міграції немає.

Read-only сервіс `src/modules/telegram/tasks.ts` приймає Telegram identity, а не application userId. Прив'язка через `user_telegram_accounts` визначає власника; джерело даних — наявні таблиці сесій і завдань. DTO не містить правильних відповідей чи секретів. Міграція для TG-003 не потрібна. `TELEGRAM_*` залишаються опційними: без них сайт працює, але `/account` не генерує Telegram link. Webhook після ввімкнення: `https://nmt.in.ua/api/telegram/webhook`. Контракт фільтрації — у `src/modules/telegram/tasks.ts`. Завдання в боті (практика і день марафону) збирає `src/modules/telegram/taskRender.ts`: одне повідомлення. Умова, варіанти, матеріали, пояснення, розбір і підпис кнопки проходять `latexPlain.ts` (дріб, степінь, корінь — звичайний текст, кнопка до 64 символів). Формула з `\begin{…}` — одним фото. Сайт лишає KaTeX.

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
