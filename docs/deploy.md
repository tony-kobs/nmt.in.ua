# Деплой nmt.in.ua

Оновлено 2026-09-05. Перший зелений хостинг-реліз: PR #49.

## Як має бути

Розробники: PR → `dev`. Lead перевіряє і мерджить. Реліз: `dev` → `main`.

Merge / push у `main` запускає GitHub Actions: збірка на Ubuntu (нормальний glibc), далі хостинг лише міняє реліз. На ukraine.com.ua Next **не збираємо** — там glibc 2.28, `npm run build` падає.

Домен nmt.in.ua дивиться на хостинг, не на Vercel. Vercel і далі збирає `main` окремо (прев’ю / запас).

`.env.production` у git немає. Жива копія: `/home/levelhst/nmt.in.ua/www/.env.production`. Постійна копія поза `www`: `/home/levelhst/nmt.in.ua/.env.production`. Деплой копіює store → новий реліз; секрет сам не генерує.

## Що відбувається після merge в `main`

Воркфлоу [`.github/workflows/deploy-hosting.yml`](../.github/workflows/deploy-hosting.yml) (`push` на `main` або Run workflow):

1. `npm ci` → test → lint → `npm run build` → `scripts/rewrite-next-build-paths.sh` (Node 24).
2. Tar: `.next` (без `cache` / `trace` / `diagnostics`), `public`, `server.js`, `lib`, `package.json` + lock, `next.config.ts`, `messages`, **весь `src/`**, `tsconfig.json`.
3. Upload SSH-pipe (`cat > file`). SCP / appleboy не використовуємо.
4. На сервері, **поки старий `www` ще відповідає**: `releases/<sha>` → копія `.env.production` → копія живих `www/node_modules` → `npm install --omit=dev`.
5. Стоп лише Node цього сайту (`127.1.10.37` + `node server.js` / `npm run start`). Чекати, поки процеси зникли — інакше inode «переїде» разом із `mv`.
6. `mv www previous` → нова папка стає `www`.
7. Старт як у панелі: `npm run start -- --port=3000 --host=127.1.10.37`. PID: `/home/levelhst/nmt.in.ua/nmt.pid`.
8. Healthcheck друкує HTTP-код. 5xx / timeout → назад `releases/previous` + хвіст `www.nmt.in.ua.log`.

Ручний той самий шлях (з ноутбука, не з хоста):

```bash
bash scripts/deploy-hosting.sh
```

`scripts/manual-deploy-hosting.sh` лише викликає цей скрипт. CI передає `--skip-build` — збірка вже була в Actions.

Аварійно, якщо новий реліз уже живий і кривий, а `previous` ще є:

```bash
bash scripts/rollback-hosting.sh --yes
```

## Що потрібно один раз

У GitHub → Settings → Secrets and variables → Actions:

| Секрет | Що |
| --- | --- |
| `HOSTING_SSH_KEY` | Приватний ключ для `levelhst@levelhst.ftp.tools` (весь PEM, разом із `BEGIN` / `END`) |

Поки секрету немає — воркфлоу впаде **до** SSH, сайт не чіпає.

Обовʼязкові змінні на прод: `DB_*`, `SESSION_SECRET`, `CONTENT_IMPORT_API_KEY`, `ADMIN_API_KEY`, `MAX_BODY_BYTES=8388608`.

Без `SESSION_SECRET` у production вхід і реєстрація падають (`createSessionToken`). Ключ не комітити і не світити в логах. Згенерувати один раз: `openssl rand -hex 32` — і записати в обидва `.env.production` (store + `www`).

Для платної реєстрації викладача (`/register/teacher`) на хості додати `WAYFORPAY_MERCHANT_ACCOUNT` і `WAYFORPAY_MERCHANT_SECRET_KEY` у ті самі два `.env.production` (store + `www`). Не в git і не в GitHub Secrets. Без ключів сторінка лишається заглушкою; з ключами підписується Purchase (500.00 UAH) і браузер POST-ить на `https://secure.wayforpay.com/pay`. Таблиця: `scripts/sql/014_teacher_payments.sql` (або створюється сама при першому сабміті). `NEXT_PUBLIC_SITE_URL=https://nmt.in.ua` потрібен для `serviceUrl` / `returnUrl` (HTTPS). Локальний `localhost` для webhook не підходить — потрібен публічний тунель.

### Діагностика (`/diagnostic`) — одноразова міграція БД

Прод MySQL уже має контент (`themes` + `quiz_tasks`) — діагностика перевикористовує його
автоматично через звичайний `getConnection()` (`src/lib/db/mysql.ts`), нічого сідити чи
дублювати в репо не треба. Поріг доступності — `HAVING COUNT(q.id) >= 3` на тему
(`DIAGNOSTIC_TASKS_PER_THEME`, `src/modules/diagnostic/startDiagnosticTest.ts`); прод має
~36 завдань на тему, отже всі теми проходять цей поріг без змін коду.

Перед першим релізом із діагностикою прогнати один раз (`SHOW CREATE TABLE` спочатку —
див. коментар у файлі):

```bash
mysql ... < scripts/sql/006_diagnostic_ownership.sql
mysql ... < scripts/sql/007_user_self_scores.sql
```

`006` обов'язково прогнати вручну — без нього `user_id`/`theme_id` в `task_sessions` /
`tasks2session` лишаються `NOT NULL`, і будь-який старт діагностики (навіть для увійденого
учня — `theme_id` там завжди `NULL`) впаде. `007` (`user_self_scores`) додатково
самостворюється лениво в рантаймі (`ensureSelfScoreSchema`), але краще прогнати заздалегідь,
щоб перший запит не платив за DDL.

Якщо контенту для якоїсь теми тимчасово не вистачає — `/diagnostic` сам ховає форму і показує
`t("unavailable")` (`hasEligibleDiagnosticContent`, fail-open при збої/таймауті читання БД);
це не помилка, а очікуваний стан порожнього каталогу.

## Скрипти

| Файл | Роль |
| --- | --- |
| `scripts/deploy-hosting.sh` | Єдиний шлях: локально або з CI (`--skip-build`) |
| `scripts/rewrite-next-build-paths.sh` | Після кожної збірки: шляхи runner → `/home/levelhst/nmt.in.ua/www` |
| `scripts/hosting-remote-lib.sh` | Стоп / старт / health на хості (`ps`/`awk`, без `ss`/`lsof`) |
| `scripts/rollback-hosting.sh` | Повернути `releases/previous` (`--yes`) |
| `scripts/manual-deploy-hosting.sh` | Аліас на `deploy-hosting.sh` |
| `scripts/ensure-hosting-max-body-bytes.sh` | Виставити `MAX_BODY_BYTES=8388608` на хості |

Хост: Node `/usr/local/node24/bin`, bind `127.1.10.37:3000`. Інші сайти на цьому акаунті теж слухають `:3000`, але **інший** `127.x` — їх не чіпати.

## Rate limit і IP за проксі

Node бачить лише `127.1.10.37`, тому клієнтський IP для лімітів береться з заголовків
(`src/lib/security.ts` → `clientIp`):

1. `CF-Connecting-IP` (якщо є Cloudflare)
2. `X-Real-IP` (бажано: nginx `proxy_set_header X-Real-IP $remote_addr;`)
3. інакше **правий** елемент `X-Forwarded-For` (не лівий — його підставляє клієнт)

`TRUSTED_PROXY_HOPS` у `.env.production` (дефолт `1` на проді). У dev XFF ігнорується.

**Перевірка на проді** (з машини з відомим IP):

```bash
# Без підміни — має рахуватись ваш реальний IP (або X-Real-IP від панелі)
curl -sI https://nmt.in.ua/login | head -5

# З підміною — rate limit НЕ повинен бачити 203.0.113.9 як окремий бакет
# (якщо після ~20 швидких /login з цим заголовком ви все ще не в 429,
# а без нього потрапляєте — edge досі довіряє клієнтському XFF і треба
# виставити X-Real-IP з $remote_addr у панелі / nginx)
curl -sI -H "X-Forwarded-For: 203.0.113.9" https://nmt.in.ua/login | head -5
```

Ідеал на nginx перед Node:

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
```

## Граблі, які вже були

1. **Шляхи GitHub runner у `.next`.** Next 16 webpack пише в RSC-маніфест `/home/runner/work/nmt.in.ua/nmt.in.ua/...`. На хості цього немає — кожна сторінка 500. Після `npm run build` обов’язково `rewrite-next-build-paths.sh`. Перевірка дивиться лише runtime-файли (`js` / `json` / `rsc`); `.next/trace` лишає шляхи раннера — це телеметрія, не причина 500. У tar їде **весь `src`**, не лише `src/i18n`.
2. **`mv www`, поки Node живий.** Процес тримає inode каталогу і далі відповідає з `releases/failed`. Перед будь-яким `mv` процеси nmt мають зникнути. Не чіпати інші сайти на `:3000`.
3. **Healthcheck `-f` без коду.** 500 виглядало як «сайт лежить». Тепер у лог пишеться код відповіді і хвіст `www.nmt.in.ua.log`.
4. **Bash на хості без `/dev/fd`.** `<(ps …)` падає: `/dev/fd/62: No such file or directory`. Немає `ss`/`lsof`. Стоп — тільки `ps | awk` по `127.1.10.37` + `node server.js` / `npm run start`. Старт як у панелі.
5. **glibc 2.28.** Свіжий `@next/swc` хоче 2.29. Беремо живі `node_modules` з поточного `www`, потім `npm install`.
6. **Немає `SESSION_SECRET`.** Сайт 200, але логін / реєстрація ламаються. Деплой копіює store; якщо в store ключа не було — треба дописати вручну і перезапустити лише nmt Node.

## Чого більше немає

Кореневий `deploy.sh`. Не повертати: збірку Next на хості, appleboy/SCP, `killall -9 node`, `fuser 3000/tcp` без HOST.

## Якщо CI червоний, а сайт живий

Зламані тести / збірка / SSH **не** чистять `www`. Якщо healthcheck після swap не пройшов — скрипт сам відкотився. Якщо сайт уже новий і кривий, а `previous` ще є: `rollback-hosting.sh --yes`.

## Перевірка після релізу

- https://nmt.in.ua відповідає 200
- `/welcome` вантажить hero
- вхід `demo-student` / звичайний учень і реєстрація
- `/wp-admin` і `/.env` — 404
