# Онбординг nmt.in.ua

Короткий гід для першого дня. Його рідко міняють.

Як здати роботу — у [«Як робити задачу»](./contributing.md).

Живий сайт: <https://nmt.in.ua>. Репозиторій: <https://github.com/tony-kobs/nmt.in.ua>. Працюємо з гілки `dev`.

---

## 1. Що ми робимо

nmt.in.ua — тренажер підготовки до НМТ з математики. Учень проходить тест за темою, симулятор або діагностику і бачить результат. Викладач веде учнів і призначає тести. Адмін тримає банк завдань.

Інтерфейс українською, англійською і німецькою.

| Роль | Що бачить з `/` |
| --- | --- |
| Гість | Лендінг. Діагностика на `/diagnostic` без входу |
| Учень | Старт тесту за темою |
| Викладач | Одразу `/assign` |
| Адмін | Редактор банку, не тренажер |

## 2. Задачі

Задачі призначає Антон у Trello. Доступ до дошки дає він.

## 3. Перший день

- Напиши Антону в Telegram: доступ на запис у `tony-kobs/nmt.in.ua`, параметри MySQL і контакти. Ніки в Telegram дає він у перший день, у цьому гіді їх немає. У pull request Антона згадують як [@tony-kobs](https://github.com/tony-kobs).
- Node.js 24 (як на хостингу і в CI) і npm. Версія записана в `.nvmrc`. Клон, одразу `git checkout dev`. У `main` не працюємо.
- Скопіюй `.env.example` у `.env.local` і заповни лише `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. `DB_PORT` у прикладі вже `3306`. Інші рядки не вигадуй. Якщо базу ділите з кимось, додай свій `SESSION_SECRET` (`openssl rand -hex 32`).
- `npm install && npm run dev` → <http://localhost:3000>
- Зареєструй учня на `/register`. Адміна підвищують так: `node scripts/promote-admin.mjs <login>`.
- Пройди сайт очима, розділ нижче, і зроби розігрів.
- Після розігріву отримай у Антона доступ до Trello і візьми задачу.
- Перед версткою прочитай `.cursor/rules/design-system.mdc`. Правила для ШІ лежать у `.cursor/rules/` і `AGENTS.md`.

Без MySQL лендінг відкриється, а кабінет впаде на запиті до бази. `DB_HOST`, `DB_USER`, `DB_PASSWORD` і `DB_NAME` мають бути непорожні: порожній рядок код вважає відсутньою змінною (`src/lib/db/mysql.ts`).

## 4. Як підняти проєкт

```bash
git clone https://github.com/tony-kobs/nmt.in.ua.git
cd nmt.in.ua
git checkout dev
git pull origin dev
npm install
cp .env.example .env.local
npm run dev
```

Перед `npm install` постав Node.js 24 (як на хостингу і в CI). Номер лежить у `.nvmrc`: за наявності nvm достатньо `nvm use`.

Секрети не комітити. `.env*` у gitignore, крім `.env.example`.

### Змінні

Клас звірено з `.env.example` і читанням у коді. «Локально обов’язково» — без цього не заводиться кабінет. «Необов’язково» — сайт відкривається і без значення. «Лише прод» — у `.env.local` для навчання не ставимо.

| Змінна | Клас | Якщо порожня |
| --- | --- | --- |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Локально обов’язково. На проді теж | Запит до бази кидає помилку |
| `DB_PORT` | Необов’язково, у прикладі `3306` | Код бере `3306` |
| `DB_CONNECTION_LIMIT`, `DB_CONNECT_TIMEOUT_MS`, `DB_MAX_IDLE`, `DB_IDLE_TIMEOUT_MS`, `DB_PING_AFTER_IDLE_MS` | Необов’язково | Дефолти в `src/lib/db/mysql.ts` (10, 15000, 4, 30000, 10000) |
| `DB_SSL` | Необов’язково | TLS лише якщо значення `1` |
| `SESSION_SECRET` | Локально необов’язково. На проді обов’язково | У `development` cookie підписує запасний рядок у `src/modules/auth/sessionToken.ts`. На проді без секрету логін падає. Не копіюй його з `ADMIN_API_KEY` чи ключа імпорту |
| `SITE_URL` | Необов’язково | Origin у листах. Для локальних листів постав `http://localhost:3000`. На проді localhost ігнорується, лишається `https://nmt.in.ua` |
| `MAIL_SITE_URL` | Необов’язково | Запасний origin листів, якщо `SITE_URL` порожній |
| `NEXT_PUBLIC_SITE_URL` | Необов’язково для `npm run dev` | Canonical. Порожнє → `https://nmt.in.ua` (`src/constants/seo.ts`). Інлайниться на `next build`. У листах не використовується |
| `BREVO_API_KEY` | Необов’язково локально. На проді потрібен, щоб лист пішов | Локально текст падає в консоль `[mail:log]`. На проді без ключа відправка закрита |
| `MAIL_FROM` | Необов’язково | `NMT.in.ua <noreply@nmt.in.ua>` |
| `CONTENT_IMPORT_API_KEY` | Необов’язково для кабінету | `POST /api/import` без ключа відповідає 401 |
| `ADMIN_API_KEY` | Необов’язково для кабінету | `POST /api/admin/sessions` без ключа відповідає 401 |
| `WAYFORPAY_MERCHANT_ACCOUNT`, `WAYFORPAY_MERCHANT_SECRET_KEY`, `WAYFORPAY_MERCHANT_DOMAIN`, `WAYFORPAY_PAY_URL` | Необов’язково | Оплата викладача в UI зараз не продається: `/register/teacher` веде на звичайну реєстрацію. Ключі лише якщо еквайринг знову вмикають. У git не класти |
| `TEACHER_PAYMENT_TEST_BYPASS` | Необов’язково | У `development` тестова кнопка оплати і так увімкнена |
| `TRUSTED_PROXY_HOPS` | Необов’язково | Типово `0` у development і `1` на проді (`src/lib/security.ts`) |
| `MAX_BODY_BYTES` | Необов’язково | Ліміт тіла в `server.js`, типово 8388608. `npm run dev` цей файл не читає |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | Необов’язково | Без пари токен і username бот вимкнений, сайт працює |
| `TELEGRAM_SUPPORT_CHAT_ID` | Необов’язково | Звернення лишаються в адмінці |
| `MARATHON_CRON_SECRET`, `MARATHON_UNSUBSCRIBE_SECRET` | Необов’язково | Секрет статистики марафону і відписки. Для першого проходу сайту не потрібні. Відписка інакше бере `SESSION_SECRET` |
| `TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET` | Лише прод | Захищений виклик розсилки Telegram, не локальний сайт |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Лише прод | Секрет збірки і хоста. У `.env.local` для навчання не ставимо |

`HOST` і `PORT` задає панель хостингу. Локально їх не чіпай: `npm run dev` слухає порт 3000.

### Команди

| Команда | Коли |
| --- | --- |
| `npm run dev` | Щодня |
| `npm test` | Перед pull request. Інтеграційні тести з живою MySQL самі пропускаються, якщо `DB_HOST` немає |
| `npm run lint` | Перед pull request |
| `npm run build` | Коли чіпаєш сторінки або сервер |
| `npm run migrate` | Застосувати `scripts/sql/` у свою базу. Як це влаштовано — [`schema-migrations.md`](./schema-migrations.md) |
| `node scripts/promote-admin.mjs <login>` | Зробити акаунт адміном |

Демо-логінів немає.

## 5. Перший прохід по сайту

1. `/` без входу — лендінг. `/welcome` теж лендінг, навіть якщо ти вже в акаунті. Відкрий `/diagnostic` без логіну.
2. Зареєструйся учнем. На `/` обери тему, старт, одна відповідь, фініш. Порівняй підсумок із `/results` і `/sessions`.
3. `/simulator` — інший банк і інший екран, не тест за темою.
4. Вийди і зайди викладачем: має відкритись `/assign`. На `/students` можна створити учня.
5. Адмін (`promote-admin`): `/` — список завдань. Окремо `/settings`, `/feedback`, `/profiles`. Випадковий файл у спільну базу не імпортуй.

Вкладка інтерактивних форматів на `/` є лише коли в базі є каталог Stage 2. Порожньо — вкладки немає, це нормально.

## 6. Розігрів

Свій цикл до справжньої задачі: гілка, маленький diff, тест, pull request у `dev`, рев’ю Антона, мердж. Кожен учень робить свій ключ і свій тест, чужий не чіпає.

Ключ — логін GitHub у нижньому регістрі. У next-intl ключ не може містити `.`: бібліотека ділить шлях по крапці (`INVALID_KEY`). Дефіс можна. Логін GitHub складається з літер, цифр і дефісів, тож іншої заміни не треба: `Student-Login` стає `student-login`.

Якщо твій ключ уже є — розігрів пройдено. Візьми задачу в Trello.

1. Свіжий `dev`. Нижче замість `student-login` підстав свій логін за правилом вище.

   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/warmup-student-login
   ```

2. Додай один рядок у три словники, в об’єкт `Warmup` на верхньому рівні. Якщо об’єкта ще немає, створи його і не забудь кому після попереднього. Якщо він уже є, допиши лише свій ключ і не замінюй чужі:

   - `messages/uk.json`: `"student-login": "Перший рядок розігріву"`
   - `messages/en.json`: `"student-login": "First warm-up line"`
   - `messages/de.json`: `"student-login": "Erste Aufwärmzeile"`

   Рядок на сторінку не виводь. В українському тексті не став прямі лапки `"`. `src/i18n/ukCopy.test.ts` вимагає той самий набір ключів у `uk.json` і `en.json` і ламається на таких лапках. Багато ключів у `Warmup` цьому тесту не заважають, якщо uk і en збігаються. de той тест не читає, тому свій тест має торкнутись усіх трьох файлів.

3. Файл `src/i18n/warmup-student-login.test.ts`. Ключ із дефісом у тесті читай дужками, `uk.Warmup[key]`, бо крапка JavaScript такий логін не прочитає:

   ```ts
   import assert from "node:assert/strict";
   import test from "node:test";

   import de from "../../messages/de.json";
   import en from "../../messages/en.json";
   import uk from "../../messages/uk.json";

   const key = "student-login";

   test("warmup line is present in uk, en and de", () => {
     assert.equal(uk.Warmup[key], "Перший рядок розігріву");
     assert.equal(en.Warmup[key], "First warm-up line");
     assert.equal(de.Warmup[key], "Erste Aufwärmzeile");
   });
   ```

4. Перевір саме цей файл, потім увесь набір:

   ```bash
   node --require ./test/stub-server-only.cjs --import tsx --test src/i18n/warmup-student-login.test.ts
   npm test
   npm run lint
   ```

5. Закоміть, запуш `feature/warmup-student-login` і відкрий pull request у `dev`. Тіло — шаблон [`.github/pull_request_template.md`](../.github/pull_request_template.md). Заповни всі секції: «Для команди», «Для учня і викладача», «Скрінкаст» і чекліст «Здано». У «Скрінкаст» постав «потрібен» і встав посилання на запис, де видно зелений тест і три файли. Галочку «схвалено показувати» не ставь: її ставить Антон, якщо відео можна лишити в журналі. Верстки тут немає, у «Здано» рядок про ширини прибери.

6. Антон ([@tony-kobs](https://github.com/tony-kobs)) рев’ює і мерджить у `dev`. Сам у `dev` і в `main` не мердж.

## 7. Далі

[Як робити задачу](./contributing.md): гілки, карта репозиторію, шаблон фічі, верстка, переклади, безпека, міграції і що вважається зданим.
