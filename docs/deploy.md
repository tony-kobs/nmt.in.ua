# Деплой nmt.in.ua

Оновлено 2026-09-05.

## Як має бути

Розробники: PR → `dev`. Ти перевіряєш і мерджиш. Коли готово — `dev` → `main`.

З `main` **GitHub Actions збирає проєкт** (там нормальний glibc) і кладе готовий реліз на хостинг. На ukraine.com.ua Next **не збираємо**: там старий glibc, `npm run build` падає.

Хостинг лише:

1. розпаковує нову папку поруч із живим `www`;
2. ставить `npm install --omit=dev` **поки старий сайт ще відповідає**;
3. коротко рестартить лише Node цього сайту (не `killall`);
4. якщо `curl` на `127.1.10.37:3000` не 200 — повертає попередній `www`.

Vercel і далі збирає `main` окремо. Домен nmt.in.ua дивиться на хостинг, не на Vercel.

`.env.production` у git немає. Жива копія: `/home/levelhst/nmt.in.ua/www/.env.production`. Постійна копія поза `www`: `/home/levelhst/nmt.in.ua/.env.production` — щоб swap не затер секрети.

## Що потрібно один раз

У GitHub → Settings → Secrets and variables → Actions:

| Секрет | Що |
| --- | --- |
| `HOSTING_SSH_KEY` | Приватний ключ, який уже пускає `levelhst@levelhst.ftp.tools` (весь PEM, разом із `BEGIN` / `END`) |

Публічну частину цього ключа має бути в `~/.ssh/authorized_keys` на хості (вже є для ручного деплою).

Поки секрету немає — воркфлоу на `main` впаде **до** SSH, сайт не чіпає.

## Що відбувається після merge в `main`

Воркфлоу [`.github/workflows/deploy-hosting.yml`](../.github/workflows/deploy-hosting.yml):

1. `npm ci` → `npm test` → `npm run lint` → `npm run build` на Ubuntu / Node 24.
2. Тонкий tar: `.next` (без cache), `public`, `server.js`, `lib`, `package.json` + lock, `next.config.ts`, `messages`, `src/i18n`, `tsconfig.json`.
3. Архів їде **SSH-pipe** (`cat > file`). SCP / appleboy не використовуємо — на цьому хості ріжеться.
4. На сервері: `releases/<sha>` → install → `mv www releases/previous` → нова папка стає `www` (реальна директорія, не symlink — панель хостинга так спокійніше).
5. Рестарт `node server.js`, PID у `/home/levelhst/nmt.in.ua/nmt.pid`.
6. Healthcheck. Провал → назад `previous`, червоний CI, файли невдачі в `releases/failed`.

Паралельні деплої: `concurrency` у Actions + `mkdir` lock на сервері.

Ручний той самий шлях (якщо треба не чекати CI):

```bash
bash scripts/deploy-hosting.sh
```

Стара назва `scripts/manual-deploy-hosting.sh` лише викликає цей скрипт.

Аварійно повернути попередній реліз, якщо він ще лежить у `releases/previous`:

```bash
bash scripts/rollback-hosting.sh --yes
```

## Чого більше немає

Кореневий `deploy.sh` прибрано. Він на сервері робив `git reset --hard` і чекав архів з мертвого Actions.

Не повертати: збірку Next на хості, appleboy/SCP, `killall -9 node`.

## Якщо CI червоний, а сайт живий

Так і має бути: зламані тести / збірка / SSH **не** чистять `www`. Дивись лог job «Deploy hosting».

Якщо healthcheck після swap не пройшов — скрипт сам відкотився. Якщо сайт уже новий і кривий, а `previous` ще є: `rollback-hosting.sh --yes`.

## Перевірка після релізу

- https://nmt.in.ua відповідає 200
- `/welcome` вантажить hero (статика не під auth-guard)
- вхід demo / звичайний учень
- `/wp-admin` і `/.env` — 404

## Пізніше, якщо набридне Node на shared-хості

DNS nmt.in.ua на Vercel, MySQL лишити на ukraine.com.ua (потрібен доступ з IP Vercel). Або окремий VPS. Зараз це не потрібно.
