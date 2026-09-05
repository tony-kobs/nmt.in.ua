# Деплой nmt.in.ua

Оновлено 2026-09-05.

## Як має бути

Розробники: PR → `dev`. Ти перевіряєш і мерджиш. Коли готово — `dev` → `main`.

З `main` **GitHub Actions збирає проєкт** (там нормальний glibc) і кладе готовий реліз на хостинг. На ukraine.com.ua Next **не збираємо**: там старий glibc, `npm run build` падає.

Хостинг лише:

1. розпаковує нову папку поруч із живим `www`;
2. ставить `npm install --omit=dev` **поки старий сайт ще відповідає**;
3. повністю зупиняє лише Node nmt.in.ua (`127.1.10.37:3000`) і **чекає, поки порт вільний** — інакше процес «переїде» разом із `mv`;
4. міняє директорії, стартує Node вже в новому `www`, перевіряє cwd;
5. healthcheck друкує HTTP-код; 5xx / timeout → назад `releases/previous` + хвіст лога.

Vercel і далі збирає `main` окремо. Домен nmt.in.ua дивиться на хостинг, не на Vercel.

`.env.production` у git немає. Жива копія: `/home/levelhst/nmt.in.ua/www/.env.production`. Постійна копія поза `www`: `/home/levelhst/nmt.in.ua/.env.production`.

## Граблі, які вже були

1. **Шляхи GitHub runner у `.next`.** Next 16 webpack пише в RSC-маніфест `/home/runner/work/nmt.in.ua/nmt.in.ua/...`. На хості цього немає — кожна сторінка 500. Після `npm run build` обов’язково `scripts/rewrite-next-build-paths.sh` (міняє ці префікси на `/home/levelhst/nmt.in.ua/www`). Перевірка дивиться лише runtime-файли: `.next/trace` лишає шляхи раннера, це телеметрія, не причина 500. У tar їде **весь `src`**, не лише `src/i18n`; `trace` / `cache` / `diagnostics` не пакуємо.
2. **`mv www`, поки Node живий.** Процес тримає inode каталогу і далі відповідає з `releases/failed`. Перед будь-яким `mv` порт `127.1.10.37:3000` має бути порожній. Не чіпати інші сайти на `:3000` (інший HOST).
3. **Healthcheck `-f` без коду.** 500 виглядало як «сайт лежить». Тепер у лог пишеться код відповіді і хвіст `www.nmt.in.ua.log`.
4. **Bash на хості без `/dev/fd`.** `<(ps …)` падає: `/dev/fd/62: No such file or directory`. Немає `ss`/`lsof`. Стоп — тільки `ps | awk` по `127.1.10.37` + `node server.js` / `npm run start`. Старт як у панелі: `npm run start -- --port --host`. Інші сайти на цьому акаунті так само.
5. **glibc 2.28.** Свіжий `@next/swc` хоче 2.29. Беремо живі `node_modules` з поточного `www`, потім `npm install`.

## Що потрібно один раз

У GitHub → Settings → Secrets and variables → Actions:

| Секрет | Що |
| --- | --- |
| `HOSTING_SSH_KEY` | Приватний ключ для `levelhst@levelhst.ftp.tools` (весь PEM, разом із `BEGIN` / `END`) |

Поки секрету немає — воркфлоу на `main` впаде **до** SSH, сайт не чіпає.

## Що відбувається після merge в `main`

Воркфлоу [`.github/workflows/deploy-hosting.yml`](../.github/workflows/deploy-hosting.yml):

1. `npm ci` → test → lint → `npm run build` → `rewrite-next-build-paths.sh` на Ubuntu / Node 24.
2. Tar: `.next` (без cache), `public`, `server.js`, `lib`, `package.json` + lock, `next.config.ts`, `messages`, **`src/`**, `tsconfig.json`.
3. SSH-pipe (`cat > file`). SCP / appleboy не використовуємо.
4. На сервері: `releases/<sha>` → install (скрипты npm увімкнені) → стоп Node цього сайту → `mv www previous` → нова папка стає `www`.
5. Старт `node server.js`, PID у `/home/levelhst/nmt.in.ua/nmt.pid`, cwd має бути `www`.
6. Healthcheck. Провал → `previous`, червоний CI, уривок лога в Actions.

Ручний той самий шлях:

```bash
bash scripts/deploy-hosting.sh
```

`scripts/manual-deploy-hosting.sh` лише викликає цей скрипт.

Аварійно:

```bash
bash scripts/rollback-hosting.sh --yes
```

## Чого більше немає

Кореневий `deploy.sh`. Не повертати: збірку Next на хості, appleboy/SCP, `killall -9 node`, `fuser 3000/tcp` без HOST.

## Якщо CI червоний, а сайт живий

Зламані тести / збірка / SSH **не** чистять `www`. Якщо healthcheck після swap не пройшов — скрипт сам відкотився. Якщо сайт уже новий і кривий, а `previous` ще є: `rollback-hosting.sh --yes`.

## Перевірка після релізу

- https://nmt.in.ua відповідає 200
- `/welcome` вантажить hero
- вхід demo / звичайний учень
- `/wp-admin` і `/.env` — 404
