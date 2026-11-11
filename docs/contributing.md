# Як робити задачу

Для того, хто вже підняв проєкт. Перший день і розігрів — в [онбордингу](./onboarding.md).

ШІ (Cursor теж) можна. Кожен рядок свого pull request маєш могти пояснити і сам перевірити: запустити і прогнати тести. Правила, які ШІ має тримати, лежать у `.cursor/rules/` і в `AGENTS.md`. Не відправляй diff, який не читав.

---

## 1. Команда

Працюємо з `dev`. Pull request у `dev` потребує одного approve. Його ставить Антон ([@tony-kobs](https://github.com/tony-kobs)), він же мерджить студентську роботу в `dev`.

У `main` pull request відкривають лише `tony-kobs` і `groteskzp`, і лише з `dev`. Такий мердж одразу викладає сайт. Сам на хостинг не ходи і не деплой.

`main` і `dev` не видаляють і не переписують force-push. Інші гілки після мерджу зникають самі.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/коротка-назва
```

Далі коміти, push, pull request `feature/…` → `dev`.

### До кого йти

| Ситуація | Хто |
| --- | --- |
| Рев’ю і мердж pull request у `dev`, доступ, база, архітектура | Антон у Telegram. У pull request його згадують як [@tony-kobs](https://github.com/tony-kobs) |
| Застряг довше ніж на годину | Антон або Валентин (Valentyn) у Telegram. У pull request Валентина згадують як [@groteskzp](https://github.com/groteskzp) |

Писати їм у Telegram. Ніки дає Антон у перший день, у цьому гіді їх немає.

### Шари

- `src/app/` — тонкі сторінки: metadata, дані, рендер. Без бізнес-логіки і без SQL.
- `src/modules/` — логіка.
- `src/components/` — UI. Стилі — CSS Modules поруч із компонентом.
- `src/lib/db/mysql.ts` — єдиний вхід у MySQL (`getConnection`).

`userId` у Server Action бери з сесії (`requireUserId` / `requireSessionUserId`), ніколи з форми. Інакше учень А прочитає дані учня Б. Роль і бан для захищеної дії звіряються з `app_users`, не з застарілої cookie.

Групи маршрутів: `src/app/(home)/page.tsx` — `/`; `src/app/(marketing)/` — лендінг, вхід, діагностика, публічна візитка; `src/app/(app)/` — кабінет. Корінь — лише `html` / `body` і `globals.css`.

`loading.tsx` не став поруч зі сторінкою, яка кличе `notFound()`: відповідь тоді їде зі статусом 200.

### Журнал

Опис pull request — єдине місце, де пишуть, що змінилось. Дія [`.github/workflows/changelog.yml`](../.github/workflows/changelog.yml) дописує це в [`changelog.md`](./changelog.md). У гід для новачка цей перелік не копіюється.

### ШІ

Cursor і інші моделі дозволені. Перед здачею ти сам запускаєш сценарій і тести і можеш пройтись по diff рядком. Якщо не можеш пояснити зміну, це ще не твій pull request.

## 2. Карта репозиторію

| Шлях | Що тут |
| --- | --- |
| `src/app/(home)/page.tsx` | `/`: гість, учень, викладач, адмін, розробник |
| `src/app/_home/CabinetHome.tsx` | Кабінет на `/` за роллю |
| `src/proxy.ts` | Ліміт запитів, auth-guard, ролі admin / teacher |
| `src/constants/publicRoutes.ts` | Шляхи без сесії |
| `src/app/(app)/session/[id]/` | Тренажер однієї сесії |
| `src/app/(app)/(cabinet)/` | Сторінки кабінету |
| `src/components/welcome/` | Секції лендінгу |
| `src/components/dashboard/` | Шапка, меню, старт тесту |
| `src/components/testing/` | TopicTrainer, NmtTrainer, підсумок |
| `src/components/ui/` | Спільні контроли, зокрема `Select` |
| `src/modules/auth/` | Користувачі, cookie, ролі, лист verify / reset |
| `src/modules/testing/` | Старт, відповідь, фініш, симулятор |
| `src/modules/stage2/` | Інтерактивні формати, окремі таблиці |
| `src/modules/diagnostic/` | Публічна діагностика |
| `src/modules/content-import/` | CSV / JSON у базу |
| `src/modules/recommendations/` | Статистика і поради |
| `src/modules/mentor-assignments/`, `src/modules/teacher-sessions/` | Призначення і навчальні сесії |
| `src/modules/teacher-students/` | Учні, групи, інвайти |
| `messages/uk.json`, `en.json`, `de.json` | Тексти інтерфейсу |
| `src/app/globals.css` | Токени. Новий колір — сюди |
| `.cursor/rules/design-system.mdc` | Верстка. Читати перед CSS |
| `scripts/sql/` | Міграції. Застосування — [`schema-migrations.md`](./schema-migrations.md) |
| `docs/LOCAL_DEV.md` | Локальний MySQL, `.env.local`, тестові акаунти. Без прод-секретів |
| `docs/marathon.md` | Денний марафон, якщо задача про нього |

Логіка тесту не живе в компоненті. З `page.tsx` у MySQL не ходять.

## 3. Продукт у коді

Контент → тест → рекомендації → auth. Оболонка лише показує результат.

| Модуль | Папка | З чого почати читати |
| --- | --- | --- |
| Auth | `src/modules/auth` | `requireUserId`, `requireSessionUserId` |
| Тест | `src/modules/testing` | `startTopicTest`, `checkAnswer`, `finishTrainerSession` |
| Симулятор | той самий модуль | `startNmtSimulator`, банк `nmt_quiz_tasks` |
| Діагностика | `src/modules/diagnostic` | окремо від тесту за темою |
| Stage 2 | `src/modules/stage2` | свої таблиці, не `task_sessions` |
| Імпорт | `src/modules/content-import` | Joi, потім одна транзакція |
| Рекомендації | `src/modules/recommendations` | поради після фінішу |
| Призначення | `src/modules/mentor-assignments` | `/assign` |
| Сесії викладача | `src/modules/teacher-sessions` | список завдань до призначення |
| Учні | `src/modules/teacher-students` | `/students`, `/join` |

Ролі в `app_users.role`: `student`, `teacher`, `admin`, `dev`. Без перегляду розробник бачить той самий кабінет, що адмін. Адмін і розробник можуть тимчасово відкрити кабінет учня або викладача: у сесії стоїть `viewAs`, рядок у базі не змінюється. Перемикач у шапці кабінету. Призначити `dev`: `node scripts/promote-dev.mjs <login>` після міграції.

### Таблиці, які легко зачепити

Повний каталог міграцій і як вони застосовуються — [`schema-migrations.md`](./schema-migrations.md). Тут лише межі, щоб не змішати сутності.

| Таблиця | Навіщо |
| --- | --- |
| `app_users` | Наші акаунти. Не плутати з legacy `users` |
| `user_sessions` | Вхід у кабінет. Вихід ставить `revoked_at` |
| `quiz_tasks` | Банк тесту за темою і діагностики. `right_answer_n` на клієнт до перевірки не віддаємо |
| `nmt_variants`, `nmt_quiz_tasks`, `nmt_variant_tasks` | Офіційні варіанти симулятора. Не змішувати з `quiz_tasks` |
| `problems` | Задачник для друку. `/problems` читає цю таблицю, коли `workbook_catalog` (міграція `067`) збігається з `src/content/workbookProblems.json`. Поки `node scripts/import-workbook.mjs --apply` не виконано (після бекапу, не під час деплою), сторінка лишається на JSON. Число `theme_id` — id задачника, не `themes.id`. Який `themes.code` показувати — `src/content/workbookTopicMap.json`. Вставка `:::task problem:` бере назву через ту саму карту |
| `task_sessions`, `tasks2session` | Спроба учня. `session_type`: 1 учень, 2 авто, 3 викладач, 4 НМТ, 5 діагностика |
| `themes` | Тема. `code` — якір підручника |
| `sessions`, `session_tasks` | Навчальна сесія викладача. Не плутати з `task_sessions` і `user_sessions` |
| `mentor_assignments` | Призначення. `session_id` тут — сесія викладача |
| `practice_stage2_attempts` і таблиці форматів | Stage 2. Не новий `session_type` |

`src/modules/testing/sessionMode.ts` — єдине місце, де режим тренажера мапиться на diagnostic / practice / exam.

### Режими

| Режим | Де | Поведінка |
| --- | --- | --- |
| Тест за темою | `/` | Скільки вписав учень, у межах банку теми. Спершу задачі, яких цей учень ще не отримував, потім нерозвʼязані, потім повтори. Розбір одразу |
| Симулятор | `/simulator` | Офіційний варіант, 60 хв, `session_type` 4 |
| Діагностика | `/diagnostic` | До 10 завдань, складність +1 / −1, стоп після трьох помилок на рівні 1 |
| Призначення | `/assign` | Готова сесія: список і порядок як зібрав викладач. Швидке за темою: новий випадковий набір, спершу задачі, яких обрані учні ще не отримували |
| Stage 2 | `/?tab=interactive` | П’ять форматів, свої таблиці. Вкладка ховається, якщо каталог порожній |
| Дроби | `/practice/fractions` | Генератор без рядка в `task_sessions`. Ключ на клієнт не йде |

Stage 2: міграції `026`–`031` і банк `032_stage2_bank.sql`. Дії йдуть через `requireSessionUserId()`, членство в раунді і `FOR UPDATE`. Це не пункт безпеки про секрети, а окремий банк.

Гостьова діагностика: cookie `nmt_guest` підписана `SESSION_SECRET` і **не** відкриває кабінет. Запит фільтрує або `user_id`, або `guest_token` при `user_id IS NULL`.

### Маршрути

| URL | Хто |
| --- | --- |
| `/`, `/welcome` | `/` за роллю з розділу онбордингу. `/welcome` завжди лендінг |
| `/login`, `/register` | Гість. Вхід за e-mail |
| `/diagnostic` | Усі, без акаунта |
| `/session/[id]` | Власник сесії |
| `/simulator`, `/materials/textbook`, `/problems` | Учень і вище |
| `/assign`, `/students` | Викладач і адмін |
| `/results`, `/sessions` | Учень бачить своє, викладач — клас |
| `/account` | Усі в кабінеті. Адмін без навчальних віджетів |
| `/settings`, `/feedback`, `/profiles`, `/admin/textbook` | Адмін |
| `/marathon/[slug]` | Публічна сторінка курсу |

Випадковий шлях без сесії веде на `/login`. Неіснуюча публічна сторінка на кшталт `/welcome/немає` — 404.

## 4. Як додати фічу

- Логіка — функція в `src/modules/<модуль>/`, експорт через `index.ts`.
- Вхід з форми спочатку проходить Joi у `src/validations/`. У дію потрапляє вже нормалізоване значення.
- Server Action у `modules/.../actions.ts`. Після валідації: `const userId = await requireUserId()` або `requireSessionUserId()` на гарячому шляху.
- `page.tsx` лише збирає дані і рендерить компонент.
- UI — папка `Component/Component.tsx` і `Component.module.css`. Без Tailwind і без нової UI-бібліотеки.
- Текст — ключ одразу в `messages/uk.json`, `en.json`, `de.json`.
- Колір, відступ, радіус — токен з `:root` у `globals.css`.
- Секція кабінету — `<section aria-labelledby>` і справжній заголовок. Один `h1` на сторінку.
- Тест поруч: `foo.ts` і `foo.test.ts`. Запуск — `npm test`.
- Нова публічна сторінка — додай у `PUBLIC_PAGE_PATHS` і перевір `src/proxy.ts`.
- Перед pull request: `npm run lint && npm test`. Для UI ще ширини 375 / 768 / 1240 / 1440 / 1920.

## 5. Верстка

Повний контракт — `.cursor/rules/design-system.mdc`. Якщо він суперечить «як гарніше», перемагає файл правил.

- Mobile-first. База без медіа-запиту. Далі лише `min-width`: 375, 768, 1240, 1440, 1920. Випадкові пороги не додавати.
- Типографіка і великі відступи стрибають на цих ширинах, не через `vw` між ними.
- Ширина з макета — `max-width`, не голий `width`. На картці немає фіксованої `height`.
- Один контейнер: клас `.container`.
- Чистий `#fff` не використовуємо. Фон сторінки — `var(--page)`.
- Іконки — інлайн SVG, `currentColor`.
- Тап від 44×44. Кільце фокуса `:focus-visible` не знімати.
- Анімації лише `transform` і `opacity`. `prefers-reduced-motion` їх вимикає.
- Списки — компонент `Select`, не нативний `<select>`.

`display: grid` без колонок роздуває блок: став `grid-template-columns: minmax(0, 1fr)`. Не став `z-index` на `.body` кабінету.

## 6. Локалізація

uk / en / de через next-intl. Мова в cookie, префікса `/en` в URL немає. Перемикач — `LanguageSwitcher`.

- Новий рядок інтерфейсу — три файли `messages/*.json` в одному коміті.
- Назви тем і тексти завдань з бази не перекладаємо.
- Помилка з Server Action — ключ словника, не сирий рядок українською в модулі.
- На клієнт не тягни весь кабінет: `pickClientMessages(pathname)`.
- `src/i18n/ukCopy.test.ts` звіряє ключі uk і en і забороняє в українському рядку прямі `"`. de у цей тест не входить: його перевіряй окремо.

## 7. Безпека

- Не світи секрети. `.env.local` у git не клади.
- Імпорт і admin API без ключа лишаються 401.
- `right_answer_n` і `comments` не віддавай клієнту, поки відповідь у тесті не перевірена. У задачнику `/problems` ключ можна тримати в HTML і ховати стилем.
- `userId` лише з сесії.
- Логін з префіксом `demo-` реєстрація відхиляє.
- Статика з `public/` не повинна потрапляти під auth-guard.
- `setSessionCookie` дає новий термін cookie. `renewSessionCookie` зберігає старий. У профільні дії (аватар, оновлення cookie) не підставляй `setSessionCookie`. Дедлайн сесії тесту ставиться один раз: `src/modules/testing/sessionExpiry.ts`.
- Cookie гостя `nmt_guest` не авторизує кабінет.

## 8. Міграції

Новий файл у `scripts/sql/` бери наступним вільним номером на свіжому `dev`. Зараз останній — `067`, отже новий — `068_коротка_назва.sql`. Процедура, журнал `schema_migrations` і чому файл не перейменовують після продакшену — [`schema-migrations.md`](./schema-migrations.md).

Перед відкриттям pull request ще раз підтягни `dev`. Якщо той самий номер уже зайняли, перебазуйся і перейменуй **лише свій** файл, якого ще немає в базі. Два студенти з однаковим номером не мерджаться в тиші: перевірка в CI падає на новому дублі.

Історичні пари лишаються як є, їх не перейменовувати: `032_stage2_bank.sql` і `032_teacher_ratings.sql`, `044_notification_channels_and_invites.sql` і `044_user_sessions.sql`. Третій файл з номером 032 або 044 теж завалить перевірку.

На прод міграцію руками з цього гіда не запускай.

## 9. Як здати

Шаблон тіла — [`.github/pull_request_template.md`](../.github/pull_request_template.md). Його секції і є опис:

1. **Для команди** — що змінилось у коді. Звідси береться журнал.
2. **Для учня і викладача** — що побачить людина на сайті. Порожнє, якщо в новини це не йде.
3. **Скрінкаст** — для учнівської роботи постав «потрібен» і додай посилання. Це демо. «Схвалено показувати» ставить Антон, якщо запис можна лишити в журналі.
4. **Здано** — чекліст із шаблону: лінт, тести, локальна перевірка, ширини якщо була верстка, три мови, без секретів.

Назва: `feat: …`, `fix: …` або `docs: …`. Ціль — `dev`.

Здано, коли одночасно:

- Антон схвалив pull request і змерджив його в `dev`;
- у описі є скрінкаст;
- `npm run lint` і `npm test` зелені (це ще й перевіряє CI на pull request у `dev`);
- сценарій прогнаний локально, не лише тестами;
- якщо змінилась верстка — є знімки або примітка про 375 / 768 / 1240 / 1440 / 1920;
- нові тексти є в uk, en і de;
- у diff немає секретів, `.env.local` і ключів.

Один pull request — одна зміна. Фікс і нова фіча краще окремо.

Сетап — [онбординг](./onboarding.md). Локальна база — [LOCAL_DEV.md](./LOCAL_DEV.md). Карта, контакти і цей порядок здачі — цей файл. Задачу береш у Trello: доступ дає Антон.
