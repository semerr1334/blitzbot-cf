# BlitzBot — помощник в чате (Cloudflare Workers)

Telegram-бот для тестеров мода WoT Blitz Offline: FAQ, что уже починено, ссылка на последнюю версию.

**Код:** `worker.js` (собирается из `kb.json` скриптом `tools/make_worker.py`).
**Запуск:** Cloudflare Workers.

## Установка

1. Cloudflare Dashboard → Workers & Pages → Create → **Import a repository** → этот репозиторий.
2. Build command: пусто. Deploy command: `npx wrangler deploy`.
3. Settings → Variables and Secrets:
   - `TELEGRAM_BOT_TOKEN` (Secret)
   - `WEBHOOK_SECRET` (Secret) — любая строка
   - `ADMIN_IDS` — твой user id
   - `ALLOWED_CHAT_IDS` — id чатов, пусто = любой
   - `GITHUB_TOKEN` (Secret) — read-only, чтобы читать приватные логи
4. Открой `https://<worker>.workers.dev/?set=1` — включит webhook.

Подробно: `deploy/CLOUDFLARE-5-MIN.md`.

## Обновить ответы бота

Правь `kb.json` и пересобери `worker.js` (`tools/make_worker.py`), либо правь `worker.js` напрямую → commit → Cloudflare задеплоит.
