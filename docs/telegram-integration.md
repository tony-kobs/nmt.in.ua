# Інтеграція Telegram: TG-001–TG-008; TG-010–TG-017

Telegram -> `/api/telegram/webhook` -> прикладний сервіс `src/modules/telegram` -> чинне підключення `src/lib/db/mysql` -> MySQL.

Telegram ніколи не підключається безпосередньо до MySQL. Процес Next.js не запускає постійно активного бота. Обробляються команди `/start`, `/tasks`, `/today` і `/done` у приватних чатах. Отримання інших оновлень підтверджується без надсилання відповіді користувачу.

Автентифікований користувач створює посилання зі сторінки `/account`. Випадковий токен розміром 32 байти повертається в посиланні для відкриття бота Telegram; зберігається лише його хеш SHA-256. Створення нового посилання робить попередні невикористані посилання цього користувача недійсними. Посилання діє десять хвилин. Вебхук перевіряє секретний заголовок, параметр команди `/start` та ідентифікатор користувача Telegram, потім блокує рядки токена й користувача та атомарно створює унікальну прив’язку облікового запису Telegram і позначає токен використаним. Повторне використання, завершення терміну дії, блокування користувача або вже наявна прив’язка цього ідентифікатора до будь-якого облікового запису призводять до відмови із загальним повідомленням для користувача. Паролі ніколи не передаються через Telegram.

Схему визначено у `scripts/sql/035_telegram_account_linking.sql`; вона також створюється за потреби під час прив’язки відповідно до чинного підходу роботи з базою даних. Змінні `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` і `TELEGRAM_WEBHOOK_SECRET` необов’язкові: налаштовуйте їх лише на сервері під час увімкнення Telegram. Без них `/account` не може створити посилання Telegram, а вебхук повертає 503; інші сторінки продовжують працювати. `.env.example` містить лише закоментовані приклади. Під час увімкнення застосуйте схему прив’язки або дозвольте її створення та зареєструйте `https://nmt.in.ua/api/telegram/webhook` у Telegram із тим самим секретним токеном. TG-003 не автоматизує реєстрацію. Токен вебхука має залишатися на сервері. Не використовуйте виробничу базу даних для локальної перевірки.

## TG-003 — API завдань лише для читання

`src/modules/telegram/tasks.ts` експортує `getLinkedUserByTelegramId(telegramUserId)` і `getTelegramTaskSessions(telegramUserId)`. Обидві функції приймають додатне безпечне ціле число або його канонічне десяткове представлення рядком, визначають користувача через `user_telegram_accounts.telegram_user_id` та відхиляють заблоковані облікові записи. Жодна з них не приймає ідентифікатор користувача застосунку й не надає доступ за ім’ям користувача. Результати розрізняються за полем `status` і містять безпечні коди помилок `invalidIdentity`, `notLinked` та `databaseFailure`. Невідомі й заблоковані користувачі отримують однаковий результат `notLinked`; прив’язаний обліковий запис без актуальних завдань отримує `success` із порожнім списком. Помилки бази даних записуються в журнал на сервері без повернення їхніх подробиць викликачам.

Сервіс сесій визначає прив’язку й читає сесії власника одним параметризованим запитом SELECT, тому між окремим визначенням користувача та запитом не виникає стану гонитви. Таблиці `task_sessions`, `tasks2session` і `themes` залишаються джерелом достовірних даних; таблиці призначень наставника задають чинні обмеження розкладу. Цей API не створює схему, не виконує міграцій, транзакцій або змін даних. Чинні міграції, зокрема 033 і 035, мають бути вже застосовані; відсутня таблиця спричиняє `databaseFailure`, а не виконання команд зміни схеми.

До списку включаються лише числові статуси 2 (створено) і 3 (заплановано). Виключаються статус 1 (завершено), невідомі статуси, сесії з простроченим, відсутнім або недодатним терміном дії, а також рядки, які вже вважаються завершеними за правилом відображення сесій (`tasks_number > 0`, `right_number >= tasks_number`, `time > 0`). Термін дії вважається завершеним за умови `now >= expire_time`, відповідно до `sessionExpiry.ts`. Скасовані призначення наставника, майбутні моменти доступності `available_at` і минулі терміни виконання `due_at` виключаються без зміни цих сесій. Типи сесій зберігаються, зокрема симулятор і діагностика; відсутня тема залишається `null`.

Сортування повторно використовує чинне правило списку сесій `id DESC`. `TELEGRAM_TASK_SESSIONS_LIMIT` задає жорстке обмеження в базі даних — 50 сесій. Компактний DTO містить лише ідентифікатор і тип сесії, ідентифікатор і назву теми, числовий статус, кількість завдань, кількість відповідей та термін дії в секундах Unix. Для підрахунку використовуються прив’язки завдань, що належать тому самому прив’язаному користувачу; враховуються як правильні (1), так і неправильні (-1) відповіді, але не завдання без відповіді (0). Якщо прив’язок ще немає, кількість завдань береться із запланованого значення `tasks_number` сесії. Сервіс ніколи не приєднує банк відповідей до завдань і не розкриває правильні відповіді, розв’язки, дані автентифікації або рядки бази даних. Він не залежить від налаштувань `TELEGRAM_*` і не додає кінцевих точок HTTP або команд вебхука.

## TG-004 — команди роботи із завданнями

`/tasks` повертає актуальні сесії TG-003 зі збереженням перевірки власника, статусів, доступності, терміну дії, сортування й обмеження у 50 сесій. `/today` викликає `getTelegramTodayTaskSessions` з окремим SQL-запитом, обмеженим датою, та використовує ті самі правила власності й доступних для роботи статусів (2/3). Запит застосовує `expire_time >= startSec AND expire_time < endSec` до сортування й не має обмеження у 50 рядків. Відповідь залишається в межах обмеження Telegram на довжину тексту.

Раніше явного правила часового поясу для дня завдань не було. Тепер `TELEGRAM_TASK_TIME_ZONE` визначає `Europe/Kyiv` для обчислення дня й відображення термінів у Telegram незалежно від часового поясу сервера. Застосунок перетворює опівніч сьогоднішнього та завтрашнього дня за київським календарем у межі UTC в секундах Unix, використовуючи дані часових поясів IANA середовища виконання. Інтервал `[startOfToday, startOfTomorrow)` включає першу межу й виключає другу; дні переходу на літній або зимовий час можуть тривати 23 або 25 годин. Поле бази даних `expire_time` залишається в секундах Unix і порівнюється числовим способом без перетворення часових поясів у SQL. Належність до сьогоднішнього дня визначається терміном дії сесії, а не датою призначення чи створення. Чинні правила доступності продовжують діяти: термін, що настав до моменту запиту або саме в цей момент, вважається простроченим, навіть якщо він належить до календарного інтервалу.

## TG-005 — завершення сесій завдань

Коли Telegram налаштовано, для кожної відображеної сесії додається команда `/done <посилання>`. Непрозорі посилання використовують AES-256-GCM із випадковим одноразовим значенням та ключем, похідним від чинного серверного секрету вебхука з окремим контекстом для посилань на завдання. Ідентифікатор користувача Telegram використовується як додаткові автентифіковані дані. Посилання не містять читабельних ідентифікаторів бази даних або облікових даних і самі по собі не надають права на завершення: щоразу повторно перевіряються прив’язка користувача застосунку, відсутність його блокування та належність сесії. Зміна секрету вебхука робить попередні посилання недійсними; потрібно отримати новий список через `/tasks` або `/today`. Міграції та додаткові налаштування не потрібні. Чинні правила фільтрації списків і межі дат збережено.

`completeTelegramTask` в одній транзакції блокує рядки прив’язаного облікового запису, власної сесії та призначень наставника. Завершення дозволено лише для актуальних сесій зі статусами 2/3, чинним терміном дії та без скасованих призначень, призначень із майбутнім початком доступності або простроченим терміном виконання. Операція делегується `finishTrainerSession`, а для типу 5 — `finishDiagnosticSession` у межах тієї самої транзакції. Збережено чинні правила підрахунку відповідей, оцінювання першої спроби, обліку витраченого часу та завершення діагностики. Сесії з невідповіданими завданнями й заплановані сесії без прив’язаних завдань завершити не можна: спочатку потрібно виконати роботу в застосунку. Відповіді не вигадуються, термін дії сесії не продовжується. Після першого підтвердженого запису повторне або одночасне завершення безпечно відхиляється.

Після завершення сесії тренажера використовується той самий сервіс `sessionCompletionFollowUp`, що й у вебзастосунку, для збереження рекомендацій та скидання кешів результатів і сесій. Як і у вебзастосунку, робота з рекомендаціями відбувається після транзакції завершення; помилка записується в журнал і не може скасувати збережений результат. Telegram підтверджує завершення, зафіксоване в базі даних, навіть якщо подальша обробка завершилася помилкою. Завершення діагностики не створює рекомендацій. Некоректні команди повертають українську підказку щодо використання, відхилені завдання — безпечне пояснення, а неочікувані помилки сховища — загальне повідомлення без внутрішніх подробиць. Приймаються лише приватні повідомлення, у яких ідентифікатор відправника збігається з ідентифікатором чату.

## TG-006 — деталі та інтерактивне завершення

У `/tasks` і `/today` для відображених завдань є кнопки «Деталі» та «Завершити». Деталі показують лише назву теми (або «Навчальна сесія»), стан та термін у часовому поясі Europe/Kyiv. Кнопка «Відкрити кабінет» веде на чинну сторінку `https://nmt.in.ua/sessions`; URL не містить внутрішніх ідентифікаторів. Відповіді, розв’язки та дані автентифікації не читаються й не передаються.

Перше натискання «Завершити» нічого не змінює: бот запитує підтвердження з кнопками «Так, завершити» та «Скасувати». Посилання підтвердження має окремий автентифікований контекст, тому звичайне посилання завдання не можна використати як підтвердження. Після схвалення викликається тільки чинний `completeTelegramTask`; він повторно перевіряє всі правила TG-005 у транзакції, зокрема при зміні стану між підтвердженням і виконанням. Команда `/done <посилання>` збережена з чинною поведінкою TG-005 і є явною командою завершення.

Кожне читання деталей перевіряє актуальну прив’язку Telegram, відсутність блокування й власника одним параметризованим запитом. Вже завершене, прострочене, скасоване, майбутнє або невідоме за статусом завдання показується без кнопки завершення. Чужі й видалені завдання та недійсні посилання отримують безпечну пропозицію оновити `/tasks` або `/today`. Від’єднані й заблоковані користувачі отримують однакову підказку підключити Telegram. Після зміни секрету старі посилання недійсні; окремого строку зберігання callback немає, актуальний стан перевіряється при кожній дії. Помилки сховища не розкривають подробиць.

Callback приймається лише у приватному чаті з тотожними відправником і власником чату; дані обмежено 64 байтами та форматом дії з непрозорим посиланням. Вебхук викликає `answerCallbackQuery` перед обробкою дії, включно з некоректними даними у допустимому приватному callback. Відповідь із клавіатурою надсилається одним повідомленням. TG-006 реалізовано. Цей інкремент не додає залежностей, міграцій, планувальників або Mini App.

## TG-007 — New available task notifications

`processTelegramTaskNotifications()` is a server-only entry point. Apply ledger migration `scripts/sql/037_telegram_task_notifications.sql` after existing account-linking and task/assignment migrations. Production initialization calls `ensureTelegramSchema()` for accounts and preferences; it does not create the delivery ledger or legacy task tables. Telegram remains optional for the application; processing requires existing `TELEGRAM_*` configuration.

The processor enumerates linked, non-banned accounts with a private chat matching their Telegram identity. It reuses the TG-003 eligibility query through `getTelegramAvailableTaskSessions`, without the 50-row command display limit. Only owned sessions with statuses 2/3, a positive future expiry, no display-completion state, and no cancelled, not-yet-available or overdue mentor assignment qualify. All existing session types, including diagnostics, retain their rules. Before sending, it locks and rechecks the account/user, owned session and assignment rows. It never writes task, answer, completion or recommendation state.

Each eligible session produces `У вас доступне нове завдання.` and a `Деталі` button using the existing TG-006 `d:` callback and identity-bound opaque reference. No internal IDs appear in the text or callback plaintext. Details and completion continue through TG-006/TG-005 with their existing authorization checks. The webhook and notifications share `sendTelegramMessage`; transport contains no eligibility rules and validates both HTTP status and the Telegram response envelope.

Delivery state is separate in `telegram_task_notifications`, keyed by `(account_id, session_id, notification_type)`. Supported types include `new_task`, `deadline_soon`, and `teacher_result`. A transaction and locking read atomically claim `ready`, or `sending` whose last attempt is at least 15 minutes old, and record a fresh attempt before sending. Delivered rows and younger claims never retry; concurrent workers cannot claim the same attempt. Eligibility is revalidated under existing locks. Confirmed success stores delivery time and message ID; confirmed Telegram rejection returns the row to `ready`. Counters describe processing outcomes, not task mutations.

Telegram sending and MySQL persistence cannot form one atomic transaction. A timeout, lost response, interrupted process, or failed post-send write leaves a durable `sending` claim, retryable at the 15-minute boundary. If Telegram accepted the message but its response or delivered-state write was lost, retry can deliver a duplicate. This recovery policy does not provide exactly-once delivery. Daily digest slots retain their separate once-per-day policy: uncertainty keeps the slot and confirmed rejection releases it.

Notifications are evaluated during processing. Existing eligible sessions and new links are included without a creation-date cutoff; expired sessions are excluded. Removing a link deletes its ledger via the foreign key; relinking creates a new account key. Processing does not mutate tasks, answers, completion, recommendations, or daily marathon data. No queue or background worker is introduced.

## TG-008 — автоматичний запуск сповіщень

POST `/api/telegram/notifications/process` runs in Node.js with `maxDuration = 60`. Authentication remains `Authorization: Bearer <TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET>`, compared through SHA-256 and `timingSafeEqual`; invalid authorization returns 401 before processing. Query `afterAccountId` is an optional non-negative safe integer, defaults to 0, and rejects malformed values with 400. The body is unused. Exceptions return an empty 500; unsupported methods retain Next.js behavior.

Each invocation processes at most 25 accounts in ascending account-ID order with a 35-second soft work budget. Responses retain `sent`, `skipped`, `failed`, `rejected`, and `uncertain`, and add `processedAccounts`, `complete`, and `nextCursor`. Continue with `?afterAccountId=<nextCursor>` until complete; start a new sweep at 0. The cursor marks the last fully processed account. Budget exhaustion within an account causes it to be revisited; ledger claims and digest slots protect completed work. Unprocessed accounts are not counted as completed or sent. Final batches return `complete: true` and `nextCursor: null`.

The 35-second work budget stops new work and reserves time for the 15-second transport timeout. The production database adapter adds a 5-second operation timeout and a 50-second total deadline, destroys timed-out connections, and releases connections acquired after timeout. The soft budget alone cannot cancel SQL work; the adapter bounds production waits. Partial-account continuation filters delivered and recent sending ledger rows before repeated claim work. Deployment must support the 60-second route limit. Repository deployment documentation names ukraine.com.ua; no Vercel plan has been verified. Check actual platform limits before deployment; see [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

`.github/workflows/telegram-task-notifications.yml` calls the existing HTTPS endpoint every five minutes and through `workflow_dispatch` on main. It uses minimal permissions, one concurrency group, sequential authenticated batch requests, no redirects, and a 240-second total request budget. GitHub schedules can be delayed or skipped and do not guarantee exact delivery times. Failed or incomplete processing exits unsuccessfully and reports a cursor for manual resumption. The database ledger protects overlapping or repeated invocations. See [GitHub Actions events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Перед увімкненням застосуйте міграцію 037, налаштуйте чинні TELEGRAM_* і DB_*, додайте однаковий окремий випадковий секрет у GitHub Actions Secrets та постійну і живу .env.production на ukraine.com.ua, перезапустіть Node. Секрет не має збігатися з ADMIN_API_KEY або TELEGRAM_WEBHOOK_SECRET; значення не публікувати. Код endpoint спочатку має бути розгорнутий на основному хостингу. Лише після цього дозволяйте schedule/ручний запуск на main. Налаштування секретів, production deployment і реальний workflow у цьому інкременті не виконувалися.

To stop processing, disable the existing workflow; remove its runtime secret and restart Node to close the endpoint immediately. No scheduler, Redis, queue, or Vercel Cron is introduced. The existing workflow follows `nextCursor` with sequential authenticated calls within its 240-second request budget. An incomplete sweep fails and logs the resume cursor; processing errors preserve failure status. Resume manually from that cursor if the budget is exhausted. There is no durable cursor storage. Production processing, continuation, and real database timing require separate verification.

## TG-010 — перевірки та відомі обмеження

Private commands `/start`, `/tasks`, `/today`, `/done <reference>` and callbacks `d:`, `a:`, `y:`, `n:` preserve task authorization and completion. Account commands `/menu`, `/stats`, `/help`, `/settings` (`/notifications`) use `m:`/`p:` callbacks. `/leaderboard` and `/top` share the marathon gateway and `mh:top`. Invalid envelopes, groups, and mismatched senders are ignored.

Посилання завдань не мають власного TTL: доступ контролюють актуальні прив’язка, блокування, власник, стан, `expire_time` та розклад. `available_at <= now` дозволяє доступ; `due_at <= now` і `expire_time <= now` його припиняють. Деталі показують completed перед cancelled/expired, потім waiting та unavailable. Блокування тут означає `app_users.is_banned`; блокування бота в Telegram окремо не зберігається й може дати API rejection. Username не є авторизацією.

Webhook повертає 400 для некоректного JSON, 200 без дій для невідомих update, 500 при HTTP/network помилці `answerCallbackQuery` до обробки дії та 502 при відмові або невизначеній доставці `sendMessage`. Acknowledgement перевіряє HTTP статус, але не поле `ok` JSON і не має явного timeout. Помилка відповіді після completion не відкочує завершену транзакцію; повторне завершення відхиляється. Durable дедуплікації webhook за `update_id`/callback ID немає: повторні update можуть повторювати відповіді й читання.

Task-notification rate limiting and a durable audit log remain outside this increment. Secret validation, payload limits, server logs, and the delivery ledger remain in place. Stale `sending` claims retry after 15 minutes; exactly-once delivery is not guaranteed. Marathon webhook responses retain their existing `sendThrottled` behavior.

### Локальна перевірка

Потрібні Node.js, установлені залежності, чинні таблиці користувачів/тем/завдань/сесій/призначень (зокрема міграція 033), прив’язки 035 та ledger 037. Автоматичні перевірки використовують ізольовані transport/DB doubles і не доводять реальні MySQL locks або доставку.

```powershell
node --require ./test/stub-server-only.cjs --import tsx --test "src/modules/telegram/*.test.ts" "src/app/api/telegram/**/*.test.ts"
npm.cmd test
npx tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
git diff --check
```

Run the lint check as `npm.cmd run lint`. Record fresh automated results separately from live database, Telegram delivery, and deployment verification.

### Live Telegram перевірка

Налаштуйте локальну тестову БД та приватний чат розробника. Runtime потребує `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`; trigger — окремого `TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET`. БД читає `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` та опційний `DB_PORT` (3306). `MYSQL_*` із integration-файлу автоматично не підхоплюються: використайте контрольоване процесне відображення в `DB_*`. `TELEGRAM_TEST_CHAT_ID` — локальна домовленість перевірки, процесор її не читає. Секрети й ID не публікувати.

1. Застосуйте чинні схеми на підтвердженій локальній цілі, запустіть застосунок і зареєструйте доступний HTTPS webhook із `secret_token`, тотожним `TELEGRAM_WEBHOOK_SECRET`. Через `/account` отримайте link і відкрийте `/start`; перевірте одноразовість та відмову після 10 хвилин.
2. На синтетичних власних сесіях перевірте `/tasks`, `/today`, «Деталі», «Завершити», «Скасувати» й «Так, завершити». Відповіді спочатку збережіть у кабінеті. Повторіть завершення; перевірте незмінність після повтору та відмову для іншої identity, заблокованого/неприв’язаного користувача, expired/cancelled/waiting сесій.
3. Перед POST `/api/telegram/notifications/process` з окремим Bearer secret збережіть стан сесії/завдань. Перевірте повідомлення, кнопку «Деталі» та `delivered` із message ID у ledger. Повторіть POST: дубля немає, сесія/завдання незмінні. Відсутній/неправильний secret має дати 401 без запуску.
4. Confirmed rejection і uncertain перевіряйте ізольованими автоматичними тестами; не скидайте live `sending` без підтвердження відсутності доставки. Production endpoint, schedule та час доставки перевіряються окремо після розгортання; локальний POST їх не підтверджує.

## TG-011–TG-016 — меню, нагадування, статистика, сповіщення вчителя, налаштування

Mini App, окремий бот, планувальник чи черга не додавались. Усі сповіщення йдуть через чинний `processTelegramTaskNotifications()`, захищений trigger TG-008 і workflow кожні 5 хвилин. Бізнес-логіка лежить в окремих модулях (`account.ts`, `menu.ts`, `stats.ts`, `preferences.ts`, `teacher.ts`, `taskList.ts`), а `webhook.ts` лише маршрутизує update.

### TG-011 — головне меню

`/menu` and bare `/start` first enter the existing daily marathon gateway. Existing participants keep their original marathon menu, including those also linked to an nmt.in.ua account. Other linked, non-banned users receive the account menu. `/start <token>` and `/start mth_...` preserve account linking, marathon deep links, and security checks. `/top`, `/leaderboard`, and `mh:` callbacks use the existing marathon gateway.

Меню учня: 📚 Мої завдання, 📅 Сьогодні, 📊 Моя статистика, 🔔 Сповіщення, 👤 Мій акаунт, ❓ Допомога. Меню вчителя (`teacher` або `admin` — ці ролі можуть створювати призначення): 👥 Мої учні, 🔔 Сповіщення, 👤 Мій акаунт, ❓ Допомога. Учасникам марафону додається «🏁 Марафон» з callback `mh:menu`, тобто вхід у чинне меню марафону без змін його логіки (перевірку участі `findParticipantByChat` підключено в `route.ts`).

Кнопки меню мають callback `m:<екран>` без ідентифікаторів; кожне натискання повторно визначає акаунт. Callback приймається лише в приватному чаті, де відправник збігається з чатом, і підтверджується `answerCallbackQuery` перед обробкою. Невідомі або застарілі `m:`/`p:` дані отримують «Ця кнопка застаріла…» з кнопкою меню. Екрани з tap-навігації редагують те саме повідомлення (`editMessageText`); якщо редагувати неможливо, надсилається нове повідомлення, а «message is not modified» не дає дубля. Списки завдань з меню й команди `/tasks`/`/today` формує спільний `buildTaskListReply`, тому правила TG-003–TG-006 і посилання `/done` не змінились. Екран «Мій акаунт» показує ім’я, роль і дату прив’язки без ID та email.

### TG-012 — нагадування про завдання

Процесор лишається єдиним. Для кожного прив’язаного акаунта чинний eligibility-запит TG-003 тепер також повертає `dueAt` — найраніший `due_at` активного призначення наставника. Ефективний термін — менше з `expire_time` і `dueAt`; він показується в списках і сповіщеннях.

- `new_task` (TG-007) збережено. Текст став структурованим (тема, кількість завдань, термін, кнопки «ℹ️ Деталі» з тим самим `d:` та «📚 Мої завдання»).
- `deadline_soon`: коли до ефективного терміну лишається не більше 6 годин (`DEADLINE_REMINDER_WINDOW_SEC`). Ключ ledger — `(account, session, 'deadline_soon')`, тобто одне нагадування на сесію. Нагадування надсилається лише якщо `new_task` для сесії має стан `delivered` і доставлений до відкриття 6-годинного вікна, або якщо рядка `new_task` немає (сповіщення про нові завдання вимкнено). Завдання, оголошене вже у вікні, отримує одне повідомлення, де термін уже вказано. Перед відправкою під блокуванням повторно перевіряються прив’язка, власник, стан і те, що термін ще у вікні.
- Щоденне нагадування про незавершені завдання: одне повідомлення на акаунт за київську добу, лише між 17:00 і 21:00 за Києвом (`STUDENT_DIGEST_HOURS`) і лише якщо є актуальні завдання (до 5 рядків). Слот дня атомарно займається `UPDATE … WHERE student_digest_on <> today` (рівно один паралельний процесор отримує `affectedRows = 1`).

Нагадування марафону (відкриття дня, 19:00, анонс) працюють з таблицями марафону, а не з `task_sessions`, тому вони не перетинаються з цими нагадуваннями. Вікна 17–21 (учень) і 20–23 (вчитель) обрано так, щоб щоденне нагадування учня не збігалося з марафонським 19:00. Київська доба й година обчислюються через IANA `Europe/Kyiv` (`getKyivClock`) з урахуванням DST. Завершені, скасовані, ще недоступні, прострочені, чужі сесії й заблоковані акаунти виключаються тим самим SQL, що й у TG-007.

**Retry policy.** Ledger records in `sending` become claimable at least 15 minutes after their last attempt. The atomic claim updates its timestamp under existing locks; delivered records never retry. Lost Telegram responses can cause duplicate delivery. Daily digest slots retain their separate uncertainty policy.

### TG-013 — статистика учня

`/stats` і «📊 Моя статистика» викликають `getTelegramStudentStats(userId)` лише для `userId`, визначеного з Telegram identity; ідентифікаторів із чату він не приймає. Використано наявні сервіси `getStudentTopicStats` (вікно 12 спроб на тему, як на `/results`), `getRecentResults` (5 останніх) і `getScoreLevel`/`compareByWorstScore`; додано лише `COUNT(*)` завершених сесій. Чотири запити виконуються на одному з’єднанні; відповіді й розв’язки не читаються.

Показуються: кількість завершених сесій, середній результат (середнє `overallPercent` тем зі спробами), останні результати, до 10 тем із прогресом (🟢/🟡/🔴 за рівнями `/results`) і до 3 тем нижче 70% у блоці «Варто підтягнути». Без даних показується дружній порожній стан. Кнопка веде на `/results` без ID.

### TG-014 — сповіщення вчителя

Для акаунтів `teacher`/`admin` процесор перевіряє призначення наставника. Кожне читання поєднує `mentor_assignments.teacher_user_id = <вчитель>`, `status = 'active'`, учасника призначення, власну сесію учня (`ts.user_id = mam.student_user_id`) та **чинний** зв’язок `teacher_students`. Тому відкріплений учень, чуже або скасоване призначення ніколи не потрапляють до вчителя. Завершення визначається правилом `resolveMemberProgress` (`completed`).

- «Учень завершив завдання» (`teacher_result`, ledger `(account вчителя, session, 'teacher_result')`) містить ім’я учня, тему й результат `правильні/усього (%)`, кнопку «👤 Відкрити учня» на чинну сторінку `/students/<id>`, доступ до якої перевіряє сайт. Сценарії «завершив» і «результат доступний» збігаються (результат з’являється в момент завершення), тому це одне повідомлення без дубля. Перед відправкою під `FOR UPDATE` повторно перевіряються прив’язка й роль вчителя, roster, призначення та завершеність. Якщо доступ зник, рядок повертається в `ready` без відправки.
- **Baseline.** Сесії не мають часу завершення, тож перший запуск для вчителя (а також повторне ввімкнення цього типу) лише позначає всі вже завершені результати як `delivered` без `telegram_message_id` і записує `teacher_baseline_at`. Повідомлення надходять тільки про подальші завершення; історія не надсилається.
- «🗓 Підсумок дня» (за замовчуванням вимкнено): раз на київську добу між 20:00 і 23:00 (`TEACHER_DIGEST_HOURS`), лише якщо є активні призначення, відкриті зараз або з терміном за останню добу (до 10). Показує, скільки учнів завершили, і кількість тих, хто не встиг до терміну. Ті самі дані є на екрані «👥 Мої учні».

Логіку оцінювання, завершення й призначень не змінено.

### TG-015 — налаштування сповіщень

`ensureTelegramSchema()` automatically creates `telegram_notification_preferences` after authentication and account schema initialization, preserving the `ON DELETE CASCADE` foreign key. Concurrent initialization shares one promise and failures can retry. SQL 042 remains reference/recovery documentation, not a normal deployment step.

Missing rows default to new tasks, deadline reminders, and teacher results enabled; daily reminders and teacher summaries disabled; quiet hours unset. `dailyReminder` defaults to false in application code and SQL. Initialization alters only the SQL column default for existing tables and preserves stored preferences. Users can manually enable reminders; marathon notification behavior is unchanged. Missing-table fallback remains defensive; normal deployment initializes preferences automatically.

Екран «🔔 Сповіщення» (`/settings`) показує лише пункти ролі: учню — нові завдання, терміни, щоденне нагадування; вчителю — результати учнів і підсумок дня. Є також тихі години з фіксованими пресетами: вимкнено, 22–08, 23–07, 21–09 (Київ). Callback `p:t:<ключ>` проходить білий список (`new`, `dl`, `day`, `tr`, `td`), а пункт чужої ролі відхиляється. `p:q:<0–3>` — індекс пресета. Перемикання — атомарне `INSERT … ON DUPLICATE KEY UPDATE col = 1 - col` лише для `accountId` з перевіреного профілю; повторне ввімкнення результатів учнів скидає baseline.

Усі налаштування читає процесор: під час тихих годин нічого не claim-иться (нові завдання надійдуть після них), вимкнений тип не надсилається. Окремого налаштування частоти немає: частоту для вчителя задає вибір між миттєвими результатами та/або щоденним підсумком, а щоденні повідомлення обмежено одним на добу.

### TG-016 — подання в Telegram

Відповіді меню, списків, деталей, статистики й сповіщень використовують Telegram HTML (`<b>` для заголовків). Користувацькі назви тем та імена екрануються через `escapeTelegramHtml`. Ці відповіді вимикають preview-картку сайту (`link_preview_options.is_disabled`). Відповіді марафону не змінено: preview для відео лишається, а без `disablePreview` transport не надсилає `link_preview_options`.

Деталі завдання мають «✅ Завершити», «🌐 Відкрити кабінет» і рядок «📚 Мої завдання / 🏠 Головне меню». Недоступне завдання показує лише навігацію. Підтвердження — «✅ Так, завершити / ✖️ Скасувати»; скасування пояснює, що завдання лишається відкритим; після завершення є кнопки статистики та списку. Помилки сховища дають загальне повідомлення без внутрішніх деталей.

### Розгортання

1. Ensure existing task/assignment tables and ledger migration 037 are present. Allow the application database user to create the preferences table and alter its default. SQL 042 is reference/recovery only.
2. Keep existing `TELEGRAM_*`, `TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET`, and `DB_*`; no new variables are required.
3. Configure the caller to follow `nextCursor` until `complete: true`, and verify support for the 60-second route limit. The existing workflow follows continuation cursors within its 240-second request budget; resume manually from the logged cursor after an incomplete sweep.
4. Optionally expose `menu`, `tasks`, `today`, `stats`, `leaderboard`, `settings`, `help`, and `top` through BotFather.
5. The first teacher processing pass establishes a baseline instead of sending historical completions. Verify deployment timing and live delivery separately.

### Відомі обмеження

- Baseline і відсутність часу завершення: завершення, що сталося, поки результати вчителя були вимкнені, не надсилається після повторного ввімкнення.
- Повторне ввімкнення «Нові завдання» надішле сповіщення про актуальні завдання, які ще не мали `new_task`.
- Щоденні повідомлення пропускають добу, якщо scheduler не відпрацював у своєму вікні.
- Callback марафону (`mh:`) і `/top` не перевіряють прив’язку акаунта, як і раніше.
- Production processing, scheduler continuation, live MySQL locking, and Telegram webhook interactions require separate deployment verification.

## TG-017 - Unified daily marathon leaderboard

`/leaderboard` aliases `/top`, including bot-mention forms. Both use the existing daily marathon gateway. The leaderboard button uses `mh:top`; the duplicate `m:lb` screen and Telegram `leaderboard.ts` module are removed.

The canonical leaderboard uses `marathon_ranks` and `correct_count`. Daily marathon scoring, ranking, persistence, notifications, presentation, and participant access rules remain unchanged. Teacher account screens retain their existing roster restrictions. No second ranking implementation or broader teacher access is introduced; the website leaderboard remains unchanged.
