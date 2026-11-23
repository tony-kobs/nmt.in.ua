# NMT.in.ua — API testing (Postman)

Колекція для локального тестування API NMT.in.ua в межах завдання **[STUD-R1][QA] API-тестування в Postman**.

> **Увага:** запускати запити лише на `http://localhost:3000`. Продакшн `https://nmt.in.ua` не використовується для цих тестів.

## Структура

- `nmt-api.postman_collection.json` — колекція Postman із чотирма папками: `Auth`, `Tests & Tasks`, `Marathon`, `Admin`.
- `local.postman_environment.json` — приклад середовища **без секретів**.
- `fixtures/test.txt` — тестовий файл непідтримуваного формату для негативного сценарію імпорту.

Тести перевіряють HTTP-статуси, ключові поля або заголовки відповіді, час відповіді (менше ніж 2000 мс), а також позитивні й негативні сценарії.

## 1. Запуск локального NMT

Потрібні Node.js 24, npm і Docker. Із кореневої папки репозиторію (гілка `dev`):

```bash
nvm use
npm install
npm run db:setup
npm run dev
```

Після запуску сайт доступний за адресою `http://localhost:3000`. Деталі локального налаштування й тестові акаунти наведені в `docs/LOCAL_DEV.md`.

Для ендпоінтів зі службовою авторизацією потрібно самостійно задати **різні локальні** значення в `.env.local`:

- `ADMIN_API_KEY`
- `CONTENT_IMPORT_API_KEY`
- `MARATHON_CRON_SECRET`
- `TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET`

Після їх зміни перезапустіть локальний сервер. **Не додавайте `.env.local` і секрети до Git.**

## 2. Налаштування середовища Postman

Імпортуйте колекцію та `local.postman_environment.json` у Postman. Для ручної роботи створіть **окреме приватне середовище**, не призначене для Git, і заповніть значення:

- `baseUrl` — `http://localhost:3000`;
- `marathonSlug` — `local-daily`;
- `userId`, `themeId`, `marathonId` — ID об'єктів у вашій локальній базі;
- `adminApiKey`, `contentImportApiKey`, `marathonCronSecret`, `telegramTriggerSecret` — локальні ключі з `.env.local`;
- `sessionCookie`, `studentSessionCookie` — значення cookie `nmt_session` відповідних локальних облікових записів;
- `verificationToken`, `marathonMediaToken`, `mediaHash` — лише за наявності відповідних тестових даних.

Cookie можна переглянути в браузері: DevTools → Application → Cookies → `http://localhost:3000` → `nmt_session`. Вони мають обмежений термін дії; за потреби увійдіть повторно й оновіть значення.

У зразку Environment ключі та cookie залишені порожніми навмисно. **Не зберігайте реальні значення в публічному файлі.**

## 3. Запуск через Newman

Із кореневої папки репозиторію:

```bash
npx newman run tests/postman/nmt-api.postman_collection.json -e tests/postman/local.postman_environment.json --working-dir tests/postman
```

Ця команда демонструє синтаксис запуску. **Повний прогін із прикладом Environment не пройде**, оскільки в ньому навмисно немає ключів, cookie та частини тестових даних.

Для повного локального прогону зробіть приватну копію `local.postman_environment.json`, наприклад `local.private.postman_environment.json`, додайте справжні локальні значення й **виключіть приватний файл із Git** (наприклад, правилом `tests/postman/*.private.postman_environment.json` у `.gitignore`). Потім виконайте:

```bash
npx newman run tests/postman/nmt-api.postman_collection.json -e tests/postman/local.private.postman_environment.json --working-dir tests/postman
```

Параметр `--working-dir` використовується для відносних шляхів до локальних тестових файлів. Перевірте, що в експортованій колекції поле завантаження посилається на `fixtures/test.txt`, а не на абсолютний шлях вашого комп'ютера.

## 4. Особливості й обмеження

- `Verify email - Valid Token`: токен підтвердження одноразовий. Запит пропускається за замовчуванням; для окремого запуску потрібен новий токен та `runOneTimeTokenTests=true`.
- `Textbook Media - Valid Hash`: вимагає існуючого зображення в локальній базі. За замовчуванням пропускається; для запуску задайте `mediaHash` і `runTextbookMediaTests=true`.
- `Marathon Notifications Health - Valid Token`: `503` може бути очікуваним станом, якщо локальний cron давно не виконувався.
- Окремі запити потребують заздалегідь підготовлених локальних даних або дійсних cookie; їхні результати залежать від стану локальної бази.
- Тести запуску навчальних сценаріїв через Next.js Server Actions не включені до цієї REST-колекції.
- Реальний імпорт контенту й позитивні сценарії завантаження файлів без підготовлених даних не виконувалися; це слід враховувати під час оцінювання покриття.

## 5. Результати й дефекти

Під час ручного тестування результати перевіряються у вкладці **Test Results** Postman. Знайдені дефекти оформлюються в таблиці стажування: кроки відтворення, очікуваний та фактичний результат, статус-код, відповідь/скриншот і середовище (`localhost`).
