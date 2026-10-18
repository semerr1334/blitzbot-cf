# BlitzBot — помощник в чате (Cloudflare Workers)

Бот для людей, которые скачали мод WoT Blitz Offline: отвечает на вопросы,
знает, что уже починено, и даёт ссылку на последнюю версию.

**Код:** `worker.js` (собран из базы знаний `kb.json`).
**Запуск:** Cloudflare Workers, бесплатно, без карты, 24/7.

## Установка

1. Cloudflare Dashboard → Workers & Pages → Create → **Import a repository** → выбери этот репозиторий.
2. Build command: оставить пустым. Deploy command: `npx wrangler deploy`.
3. Settings → Variables and Secrets — добавь:
   - `TELEGRAM_BOT_TOKEN` (Secret)
   - `WEBHOOK_SECRET` (Secret) — любая строка
   - `ADMIN_IDS` — твой user id
   - `ALLOWED_CHAT_IDS` — id чатов, пусто = любой
   - `GITHUB_TOKEN` (Secret) — read-only, чтобы читать приватные логи
4. Открой `https://<worker>.workers.dev/?set=1` — включит webhook.

Подробно, с картинками шагов: `deploy/CLOUDFLARE-5-MIN.md`.

## Обновить ответы бота

Правь `worker.js` (или собери заново из `kb.json` скриптом `tools/make_worker.py`
из основного проекта) → commit → Cloudflare пересоберёт сам.
