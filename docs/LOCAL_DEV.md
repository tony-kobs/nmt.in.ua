# Локальний запуск

Середовище для розробки на своєму комп’ютері. Прод-база, прод-бот і прод-ключ Brevo тут не потрібні і брати їх не можна.

Сетап першого дня лишається в [онбордингу](./onboarding.md). Цей файл — лише машина: Node, MySQL, змінні, тестові входи.

## Що поставити

- Node.js 24 (як на хостингу і в CI). Номер у `.nvmrc`. За наявності nvm: `nvm use`.
- npm (іде разом із Node).
- Docker із плагіном Compose. Ним піднімається локальний MySQL.

Точний патч MySQL на хостингу в репозиторії не записаний. Скрипти розраховані на MySQL 8 (з 8.0.19, включно з 8.4). `docker-compose.yml` бере образ `mysql:8.0`.

## Від клону до сайту

```bash
git clone https://github.com/tony-kobs/nmt.in.ua.git
cd nmt.in.ua
git checkout dev
git pull origin dev
nvm use
npm install
npm run db:setup
npm run dev
```

`npm run db:setup` робить три речі:

1. Якщо немає `.env.local`, копіює `.env.example`.
2. `docker compose up -d --wait` — MySQL на `127.0.0.1:3306`, база `nmt_local`, користувач `nmt`, пароль `nmt-local`.
3. `npm run migrate`, потім `npm run db:seed`.

Сайт: <http://localhost:3000>. Вхід: <http://localhost:3000/login>.

Порт 3306 має бути вільний. Якщо зайнятий, зміни проброс у `docker-compose.yml` і `DB_PORT` у `.env.local` разом.

Повторно налити ті самі фікстури: `npm run db:seed`. Зупинити контейнер: `npm run db:down`. Стерти дані тома: `docker compose down -v`, потім знову `npm run db:setup`.

## Тестові входи

Усі чотири паролі однакові: `local-dev-pass`. Це фікстура seed, не пароль із продакшену. Вхід на сайті — за поштою.

| Роль | Пошта |
| --- | --- |
| Учень | `local-student@example.com` |
| Викладач | `local-teacher@example.com` |
| Адмін | `local-admin@example.com` |
| Розробник | `local-dev@example.com` |

Логіни ті самі без домену: `local-student`, `local-teacher`, `local-admin`, `local-dev`. Пошта вже підтверджена, лист для входу не потрібен.

Що ще кладе seed:

- три теми з трьома завданнями кожна: «Лінійні рівняння», «Квадратні рівняння», «Трикутники»;
- денний марафон `/marathon/local-daily` (день 1 відкритий сьогодні за Києвом; `local-student` уже учасник);
- викладач бачить цього учня в «Мої учні», публічна візитка `/t/local-teacher`.

Повторний seed перезаписує паролі цих акаунтів, тексти локальних завдань і марафон `local-daily` (дата старту знову сьогодні). Чужі рядки не чіпає. Скрипт працює лише якщо `DB_HOST` — `127.0.0.1`, `localhost` або `::1`, і в імені бази немає `levelhst`.

## Змінні

Повний список із коментарями — `.env.example`. Код читає саме ці імена. Нижче лише те, без чого локальний кабінет не живе.

Обов’язково в `.env.local` (у прикладі вже заповнені під Docker):

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

Без них запит до бази падає. Порожній рядок теж вважається відсутнім.

Решта для `npm run dev` не обов’язкова:

- `SESSION_SECRET` — у development є запасний слабкий рядок. На хостинг його не копіюй. Свій локальний: `openssl rand -hex 32`.
- `BREVO_API_KEY` порожній — лист пишеться в консоль сервера (`[mail:log]`), реєстрація не ламається.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` порожні — бот вимкнений, сторінки відкриваються. Webhook без конфіга відповідає 503.
- `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_SUPPORT_CHAT_ID`, `TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET` порожні — відповідні виклики не приймаються (401 або тихий пропуск), процес не падає.
- `MARATHON_CRON_SECRET` порожній — HTTP-крон відповідає 401. У development тік розсилки сам не стартує, доки не поставиш `MARATHON_SCHEDULER=on`.
- `CONTENT_IMPORT_API_KEY` і `ADMIN_API_KEY` порожні — ці POST лишаються 401.
- WayForPay порожній — оплата не налаштована, сторінка реєстрації відкривається.

`.env`, `.env.local` і `.env.production` у `.gitignore`. У git лишається лише `.env.example`.

## Свій тестовий Telegram

Лише новий бот із BotFather. Токен прод-бота не вставляй.

1. У `.env.local`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (без `@`), `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`).
2. Перезапусти `npm run dev`.
3. Telegram має достукатись до твоєї машини. Тунель (наприклад ngrok) на порт 3000, потім свій webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<твій-тунель>/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Без тунеля кнопки на сайті можуть лишатись неактивними. Сайт при цьому працює. Чат команди (`TELEGRAM_SUPPORT_CHAT_ID`) теж лише свій тестовий.

## Свій Brevo

Лише ключ із власного акаунта Brevo, не з хостингу.

1. `BREVO_API_KEY` у `.env.local`.
2. `MAIL_FROM` — адреса, яку цей акаунт має право слати.
3. `SITE_URL=http://localhost:3000`, щоб посилання в листі вело на локальний сайт.
4. Перезапусти `npm run dev`.

Без ключа той самий лист видно в терміналі, де крутиться `npm run dev`.

## Чого не робити

- Не копіюй `.env.production` з хоста і не проси прод-пароль бази, токен бота чи ключ Brevo.
- Не підставляй у `DB_HOST` адресу хостингу. `npm run db:seed` на такий хост не піде, але сайт усе одно ходитиме в ту базу, якщо змінні вказати.
- Не коміть `.env.local`.
- Не став `MARATHON_SCHEDULER=on` і прод-токени разом: локальний процес почне розсилати.
- Не деплой на хостинг із цієї інструкції. Реліз — окремо, його роблять не студенти.

## Команди

| Команда | Коли |
| --- | --- |
| `npm run db:setup` | Перший раз: контейнер, міграції, seed |
| `npm run db:up` | Лише підняти MySQL |
| `npm run db:down` | Зупинити контейнер, дані тома лишаються |
| `npm run migrate` | Застосувати `scripts/sql` |
| `npm run db:seed` | Ще раз тестові акаунти, теми і марафон |
| `npm run dev` | Сайт на порту 3000 |
| `npm test` | Тести. Жива база не обов’язкова |
| `npm run lint` | ESLint |
