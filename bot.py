#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BlitzBot — помощник в чате тестеров WoT Blitz Offline.

Один файл, только стандартная библиотека Python 3.8+ (ничего не надо ставить,
нечему сломаться при обновлении пакетов).

Режимы:
  poll [--minutes N]   работать постоянно (ПК / VPS / телефон в Termux): ответ сразу
  once                 один проход (для GitHub Actions по расписанию)
  selftest             офлайн-проверки, без сети
  issues               напечатать базу знаний

Настройки — через переменные окружения или файл .env рядом с bot.py:
  TELEGRAM_BOT_TOKEN   токен от @BotFather (обязательно)
  ALLOWED_CHAT_IDS     через запятую: в каких чатах отвечать (пусто = во всех)
  ADMIN_IDS            через запятую: кому слать эскалации и /logs (твой user id)
  GITHUB_REPO          репозиторий с логами (по умолчанию semerr1334/BlitzServer1120)
  GITHUB_TOKEN         необязательно: поднимает лимит GitHub API
  DIGEST_HOUR          во сколько (по Москве) присылать сводку, по умолчанию 21
  LOG_WATCH            1 = следить за новыми логами и писать админу о проблемных
  STATE_DIR            где лежит state.json
"""

from __future__ import annotations

import json
import os
import re
import signal
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
TG_API = "https://api.telegram.org/bot{token}/{method}"
GH_API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com/{repo}/main/{path}"
MSK = timezone(timedelta(hours=3))

# --------------------------------------------------------------------------- #
# конфигурация
# --------------------------------------------------------------------------- #

def _read_dotenv(path: Path) -> dict:
    out = {}
    try:
        for line in path.read_text("utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            out[k.strip()] = v
    except OSError:
        pass
    return out


DOTENV = _read_dotenv(APP_DIR / ".env")


def env(name: str, default: str = "") -> str:
    v = os.environ.get(name)
    if v is None:
        v = DOTENV.get(name)
    return (v if v is not None else default).strip()


def env_int(name: str, default: int) -> int:
    try:
        return int(env(name, str(default)) or default)
    except ValueError:
        return default


def id_list(name: str) -> list:
    raw = env(name)
    out = []
    for part in re.split(r"[,;\s]+", raw):
        part = part.strip()
        if re.fullmatch(r"-?\d+", part):
            out.append(int(part))
    return out


TOKEN = env("TELEGRAM_BOT_TOKEN")
ALLOWED_CHATS = id_list("ALLOWED_CHAT_IDS")
ADMINS = id_list("ADMIN_IDS")
GH_REPO = env("GITHUB_REPO", "semerr1334/BlitzServer1120")
GH_TOKEN = env("GITHUB_TOKEN")
DIGEST_HOUR = env_int("DIGEST_HOUR", 21)
LOG_WATCH = env("LOG_WATCH", "1") not in ("0", "false", "no", "")
STATE_DIR = Path(env("STATE_DIR") or (APP_DIR / "state"))
STATE_FILE = STATE_DIR / "state.json"
KB_FILE = Path(env("KB_PATH") or (APP_DIR / "kb.json"))

CHANNEL = env("CHANNEL")              # канал для проверки подписки, например @blitz_news
CHANNEL_LINK = env("CHANNEL_LINK")    # ссылка на канал (для приватного — инвайт)
REQUIRE_SUB = env("REQUIRE_SUB", "0") not in ("0", "false", "no", "")

MAX_PER_MIN = env_int("MAX_PER_MIN", 15)
COOLDOWN_SEC = env_int("COOLDOWN_SEC", 3)

# --------------------------------------------------------------------------- #
# мелочи
# --------------------------------------------------------------------------- #

def log(msg: str) -> None:
    print("[%s] %s" % (datetime.now(MSK).strftime("%d.%m %H:%M:%S"), msg), flush=True)


def load_kb() -> dict:
    kb = json.loads(KB_FILE.read_text("utf-8"))
    kb.setdefault("issues", [])
    kb.setdefault("log_signatures", [])
    return kb


def http_json(url: str, data=None, headers=None, timeout: int = 25):
    body = None
    hdrs = {"User-Agent": "BlitzBot/1.0"}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    hdrs.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=hdrs,
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def http_text(url: str, headers=None, limit: int = 8_000_000, timeout: int = 30) -> str:
    hdrs = {"User-Agent": "BlitzBot/1.0"}
    hdrs.update(headers or {})
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(limit).decode("utf-8", "replace")


def gh_headers() -> dict:
    h = {"Accept": "application/vnd.github+json"}
    if GH_TOKEN:
        h["Authorization"] = "Bearer " + GH_TOKEN
    return h


def split_text(text: str, n: int = 3800) -> list:
    text = text or ""
    if len(text) <= n:
        return [text]
    parts, rest = [], text
    while len(rest) > n:
        cut = rest.rfind("\n", 0, n)
        if cut < n // 2:
            cut = n
        parts.append(rest[:cut].rstrip())
        rest = rest[cut:].lstrip("\n")
    if rest:
        parts.append(rest)
    return parts


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().replace("ё", "е")).strip()


def parse_version(text: str):
    found = re.findall(r"(?<!\d)6[.,](\d{1,2})(?!\d)", text or "")
    if not found:
        return None
    try:
        return (6, int(found[-1]))
    except ValueError:
        return None


def fmt_version(v) -> str:
    return "6.%02d" % v[1] if v else "?"


# --------------------------------------------------------------------------- #
# состояние
# --------------------------------------------------------------------------- #

class State:
    def __init__(self, path: Path):
        self.path = path
        self.data = {}
        try:
            self.data = json.loads(path.read_text("utf-8"))
            if not isinstance(self.data, dict):
                self.data = {}
        except Exception:
            self.data = {}

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value) -> None:
        self.data[key] = value

    def save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), "utf-8")
            os.replace(tmp, self.path)
        except Exception as e:
            log("не смог сохранить состояние: %s" % e)


# --------------------------------------------------------------------------- #
# Telegram
# --------------------------------------------------------------------------- #

class Telegram:
    def __init__(self, token: str):
        self.token = token
        self.me = None

    def call(self, method: str, http_timeout: int = 25, **params):
        url = TG_API.format(token=self.token, method=method)
        last = None
        for attempt in range(3):
            try:
                data = http_json(url, params or {}, timeout=http_timeout)
                if not data.get("ok"):
                    raise RuntimeError("telegram: %s" % data.get("description"))
                return data.get("result")
            except urllib.error.HTTPError as e:
                body = ""
                try:
                    body = e.read().decode("utf-8", "replace")[:300]
                except Exception:
                    pass
                last = "HTTP %s %s" % (e.code, body)
                if e.code in (400, 401, 403, 404):
                    break  # повторять бессмысленно
            except Exception as e:
                last = str(e)
            time.sleep(1.5 * (attempt + 1))
        raise RuntimeError("telegram %s: %s" % (method, last))

    def send(self, chat_id, text, reply_to=None, keyboard=None):
        text = (text or "").strip()
        if not text:
            return
        for i, part in enumerate(split_text(text)):
            params = {"chat_id": chat_id, "text": part,
                      "disable_web_page_preview": True}
            if reply_to and i == 0:
                params["reply_to_message_id"] = reply_to
                params["allow_sending_without_reply"] = True
            if keyboard and i == 0:
                params["reply_markup"] = {"inline_keyboard": keyboard}
            self.call("sendMessage", **params)


# --------------------------------------------------------------------------- #
# релиз и логи из GitHub
# --------------------------------------------------------------------------- #

class Release:
    def __init__(self):
        self.data = None
        self.at = 0.0

    def get(self) -> dict:
        if self.data and time.time() - self.at < 600:
            return self.data
        info = {"tag": "", "apk": "", "hotfix": "", "body": ""}
        try:
            d = http_json("%s/repos/%s/releases/latest" % (GH_API, GH_REPO), headers=gh_headers())
            info["tag"] = d.get("tag_name") or ""
            info["body"] = d.get("body") or ""
            assets = d.get("assets") or []
            for a in assets:
                name = a.get("name") or ""
                url = a.get("browser_download_url") or ""
                if name.lower().endswith(".apk") and not info["apk"]:
                    info["apk"] = url
                elif "hotfix" in name.lower() and not info["hotfix"]:
                    info["hotfix"] = url
        except Exception as e:
            log("не смог прочитать последний релиз: %s" % e)
        if not info["apk"] and info["tag"]:
            num = info["tag"].lstrip("vV").replace(".", "")
            info["apk"] = ("https://github.com/%s/releases/download/%s/WoT_Blitz_11.20.0_Server_v%s.apk"
                           % (GH_REPO, info["tag"], num))
        if not info["hotfix"] and info["tag"]:
            num = info["tag"].lstrip("vV").replace(".", "")
            info["hotfix"] = ("https://github.com/%s/releases/download/%s/blitz_hotfix_%s.zip"
                              % (GH_REPO, info["tag"], num))
        self.data, self.at = info, time.time()
        return info


RELEASE = Release()


def list_logs(limit: int = 40) -> list:
    """Свежие диагностические логи из репозитория: [{'epoch':..,'path':..,'sha':..}]."""
    try:
        d = http_json("%s/repos/%s/git/trees/main?recursive=1" % (GH_API, GH_REPO),
                      headers=gh_headers(), timeout=40)
    except Exception as e:
        log("не смог прочитать список логов: %s (для приватного репозитория нужен GITHUB_TOKEN)" % e)
        return []
    out = []
    for e in d.get("tree") or []:
        p = e.get("path") or ""
        if not p.startswith("logs/") or not p.endswith(".txt"):
            continue
        m = re.search(r"diag_(?:v?([0-9.]+)_)?(\d{13})\.txt$", p)
        if m:
            out.append({"epoch": int(m.group(2)), "path": p, "sha": e.get("sha") or ""})
    out.sort(key=lambda x: x["epoch"], reverse=True)
    return out[:limit]


def fetch_log(entry) -> str:
    path = entry.get("path") if isinstance(entry, dict) else str(entry)
    sha = entry.get("sha") if isinstance(entry, dict) else ""
    # приватный репозиторий: raw.githubusercontent отдаёт 404, читаем blob через API
    if GH_TOKEN and sha:
        try:
            return http_text("%s/repos/%s/git/blobs/%s" % (GH_API, GH_REPO, sha),
                             headers={"Authorization": "Bearer " + GH_TOKEN,
                                      "Accept": "application/vnd.github.raw"})
        except Exception as e:
            log("не смог скачать blob %s: %s" % (path, e))
    try:
        return http_text(RAW.format(repo=GH_REPO, path=urllib.parse.quote(path, safe="/")))
    except Exception as e:
        log("не смог скачать %s: %s" % (path, e))
        return ""


def scan_log(text: str, kb: dict) -> dict:
    sigs = kb.get("log_signatures") or []
    findings, severe = [], False
    for s in sigs:
        match = s.get("match")
        if match and match in text:
            findings.append({"text": s.get("text", match), "severe": bool(s.get("severe"))})
            severe = severe or bool(s.get("severe"))
    seen, uniq = set(), []
    for f in findings:
        if f["text"] not in seen:
            seen.add(f["text"])
            uniq.append(f)
    m = re.search(r"mod: version=([0-9.]+)\s+apk=([0-9.]+)", text)
    m2 = re.search(r"profile: name '([^']{1,40})'", text)
    m3 = re.search(r"battle: map ([A-Za-z0-9_]+)", text)
    return {
        "findings": uniq,
        "severe": severe,
        "version": (m.group(1) if m else ""),
        "apk": (m.group(2) if m else ""),
        "profile": (m2.group(1) if m2 else ""),
        "map": (m3.group(1) if m3 else ""),
    }


def log_label(path: str):
    parts = path.split("/")
    device = parts[1] if len(parts) > 2 else "?"
    m = re.search(r"diag_(?:v?([0-9.]+)_)?(\d{13})\.txt$", path)
    when = datetime.fromtimestamp(int(m.group(2)) / 1000, MSK) if m else None
    ver = m.group(1) if m and m.group(1) else ""
    return device, ver, when


# --------------------------------------------------------------------------- #
# классификатор
# --------------------------------------------------------------------------- #

NOISE = {"ок", "окей", "ok", "да", "нет", "ага", "угу", "спс", "спасибо", "привет",
         "здарова", "ааа", "эмм", "эм", "хм", "ясно", "понял", "походу", "лол", "ну",
         "плюс", "тест", "ы", "ура", "ахах", "хах"}


def is_noise(text: str) -> bool:
    t = re.sub(r"[^\w+]+", "", norm(text), flags=re.U)
    if not t or len(t) <= 2:
        return True
    if t in NOISE:
        return True
    return len(set(t)) == 1


def classify_scored(text: str, kb: dict):
    t = norm(text)
    best, best_score = None, 0
    for issue in kb.get("issues") or []:
        score = 0
        for s in issue.get("strong") or []:
            if s and s in t:
                score += 4
        for k in issue.get("keywords") or []:
            if k and k in t:
                score += 1
        if score > best_score:
            best, best_score = issue, score
    return (best if best_score >= 2 else None), best_score


def classify(text: str, kb: dict):
    t = norm(text)
    best, best_score = None, 0
    for issue in kb.get("issues") or []:
        score = 0
        for s in issue.get("strong") or []:
            if s and s in t:
                score += 4
        for k in issue.get("keywords") or []:
            if k and k in t:
                score += 1
        if score > best_score:
            best, best_score = issue, score
    return best if best_score >= 2 else None, best_score


def render(issue: dict, text: str) -> str:
    rel = RELEASE.get()
    version = parse_version(text)
    fixed = parse_version(issue.get("fixed_in") or "")
    body = issue.get("answer") or ""
    if fixed and version and version >= fixed and issue.get("answer_after_fix"):
        body = issue["answer_after_fix"]
    body = (body.replace("{apk}", rel.get("apk") or "")
                .replace("{hotfix}", rel.get("hotfix") or "")
                .replace("{fixed_in}", issue.get("fixed_in") or ""))
    return body.strip()


def known_list(kb: dict) -> str:
    groups = [("fixed", "✅ Исправлено"), ("open", "🔧 В работе"),
              ("deferred", "⏸ Отложено"), ("info", "ℹ️ Справка")]
    lines = []
    issues = kb.get("issues") or []
    for st, head in groups:
        items = [i for i in issues if issue_status(i) == st]
        if not items:
            continue
        lines.append(head + ":")
        for i in items:
            name = i.get("short") or i.get("title") or i.get("id")
            if st == "fixed" and i.get("fixed_in"):
                lines.append("• %s — с v%s" % (name, i["fixed_in"]))
            else:
                lines.append("• %s" % name)
        lines.append("")
    lines.append("Напиши, что не работает, обычными словами — подскажу, что делать.")
    return "\n".join(lines)


def issue_status(issue: dict) -> str:
    return issue.get("status") or "info"


# --------------------------------------------------------------------------- #
# ответы
# --------------------------------------------------------------------------- #

class Bot:
    apk_key = "/releases/download/"

    def __init__(self, kb: dict, tg: Telegram, state: State):
        self.kb = kb
        self.tg = tg
        self.state = state
        self.recent = {}
        self.last_user = {}
        self.escalations = []
        self.digest_sent = state.get("digest_sent", "")
        self.first_watch = "seen_logs" not in state.data
        self.seen_logs = set(state.get("seen_logs") or [])

    # -- служебное --------------------------------------------------------- #

    def allowed(self, chat_id: int) -> bool:
        return not ALLOWED_CHATS or chat_id in ALLOWED_CHATS

    def allow_reply(self, chat_id: int, user_id: int) -> bool:
        now = time.time()
        q = [t for t in self.recent.get(chat_id, []) if now - t < 60]
        if len(q) >= MAX_PER_MIN:
            return False
        last = self.last_user.get(user_id, 0)
        if now - last < COOLDOWN_SEC:
            return False
        q.append(now)
        self.recent[chat_id] = q
        self.last_user[user_id] = now
        return True

    def escalate(self, chat_id, chat_title, user, text, ask=""):
        now = time.time()
        self.escalations = [t for t in self.escalations if now - t < 3600]
        if len(self.escalations) >= 12 or not ADMINS:
            return
        self.escalations.append(now)
        who = "@%s" % user.get("username") if user.get("username") else (
            "%s %s" % (user.get("first_name") or "", user.get("last_name") or "")).strip()
        where = chat_title or ("@" + (user.get("username") or "")) if user.get("username") else (chat_title or "личка")
        msg = ("❗ Вопрос без готового ответа\n\n"
               "Чат: %s (%s)\nКто: %s (id %s)\nТекст: %s\n\nЧто просить: %s\n\n"
               "↩️ Ответь на это сообщение — твой текст уйдёт человеку.\n"
               "Или: /reply %s текст\n#r=%s"
               % (where, chat_id, who or "?", user.get("id"),
                  (text or "")[:500], ask or "уточнить детали: что делал и что случилось",
                  chat_id, chat_id))
        for admin in ADMINS:
            try:
                self.tg.send(admin, msg)
            except Exception as e:
                log("не смог написать админу %s: %s" % (admin, e))

    # -- подписка ---------------------------------------------------------- #

    def is_subscribed(self, user_id: int) -> bool:
        """Подписан ли человек на канал. Если проверить нельзя — не блокируем."""
        if not CHANNEL:
            return True
        if user_id in ADMINS:
            return True
        try:
            r = self.tg.call("getChatMember", chat_id=CHANNEL, user_id=user_id)
        except Exception as e:
            # «человека нет в канале» — это не подписка, а не «проверить нельзя»
            if re.search(r"PARTICIPANT_ID_INVALID|participant_id_invalid|user not found", str(e), re.I):
                return False
            return True
        st = (r or {}).get("status")
        return st in ("creator", "administrator", "member") or (st == "restricted" and bool((r or {}).get("is_member")))

    def gate_keyboard(self):
        link = CHANNEL_LINK or (("https://t.me/" + CHANNEL.lstrip("@")) if CHANNEL.startswith("@") else "")
        rows = []
        if link:
            rows.append([{"text": "📢 Подписаться на канал", "url": link}])
        rows.append([{"text": "✅ Я подписался", "callback_data": "sub:check"}])
        return rows

    def gate_text(self):
        return ("Ссылка на АПК — для подписчиков канала.\n\n"
                "1) Нажми «Подписаться» и подпишись.\n"
                "2) Вернись и нажми «Я подписался» — сразу пришлю ссылку.\n\n"
                "Подписка бесплатная, отписаться можно когда угодно.")

    # -- команды ----------------------------------------------------------- #

    def menu(self):
        return [
            [{"text": "🗺 Карта и коллизии", "callback_data": "i:map-collisions"},
             {"text": "🏅 Награды и знак", "callback_data": "i:mark-mastery"}],
            [{"text": "💥 Вылеты и фризы", "callback_data": "i:hangar-freeze"},
             {"text": "📲 Установка и обновление", "callback_data": "i:install"}],
            [{"text": "🆕 Что нового", "callback_data": "b:new"},
             {"text": "📋 Все темы", "callback_data": "b:all"}],
        ]

    def cmd_help(self) -> str:
        return ("Я помощник по моду. Что умею:\n\n"
                "/version — последнее обновление и ссылки\n"
                "/issues — что уже починил, что в работе\n"
                "/logs — последние логи с телефонов (для админа)\n"
                "/digest — сводка за сутки (для админа)\n"
                "/id — показать id этого чата\n\n"
                "Или просто напиши, что не работает: «улетаю за карту», «нет знака», "
                "«вылетает в ангаре» — подскажу, что делать.")

    @staticmethod
    def apk_keyboard(rel):
        rows = []
        if rel.get("apk"):
            rows.append([{"text": "⬇️ Скачать АПК", "url": rel["apk"]}])
        rows.append([{"text": "🆕 Что нового", "callback_data": "b:new"},
                     {"text": "📋 Все темы", "callback_data": "b:all"}])
        return rows

    @staticmethod
    def strip_apk(text, rel):
        apk = (rel or {}).get("apk") or ""
        if not apk:
            return text
        return re.sub(r"\n{3,}", "\n\n", text.replace(apk, "")).strip()

    def cmd_whatsnew(self) -> str:
        rel = RELEASE.get()
        if not rel.get("tag"):
            return "Не смог узнать версию — GitHub не ответил. Попробуй через минуту."
        body = (rel.get("body") or "").strip()
        if not body:
            return "Актуальная версия: %s\n\nАПК (ставить сверху, игру не удалять):\n%s" % (rel["tag"], rel["apk"])
        for ch in ("#", "*", "`"):
            body = body.replace(ch, "")
        lines = [line for line in body.splitlines() if line.strip() != ">"]
        body = "\n".join(lines).strip()
        if len(body) > 3200:
            body = body[:3190].rstrip() + "…"
        return "🆕 %s\n\n%s" % (rel["tag"], body)

    def cmd_version(self, user_id: int = 0):
        rel = RELEASE.get()
        if REQUIRE_SUB and CHANNEL and not self.is_subscribed(user_id):
            return self.gate_text()
        if not rel.get("tag"):
            return "Не смог узнать версию — GitHub не ответил. Попробуй ещё раз через минуту."
        return ("Последняя версия: %s\n\n"
                "Ставить сверху, игру не удалять — аккаунт и танки останутся."
                % rel["tag"])

    def cmd_logs(self, user_id: int, arg: str) -> str:
        if ADMINS and user_id not in ADMINS:
            return "Это команда для разработчика."
        try:
            n = max(1, min(10, int(arg.strip() or "5")))
        except ValueError:
            n = 5
        logs = list_logs(limit=60)
        if not logs:
            return "Логов пока нет (или GitHub не ответил)."
        out = ["Последние %d лог(ов):" % min(n, len(logs))]
        for entry in logs[:n]:
            device, ver, when = log_label(entry["path"])
            info = scan_log(fetch_log(entry), self.kb)
            when_s = when.strftime("%d.%m %H:%M") if when else "?"
            ver_s = info["version"] or ver or "?"
            out.append("")
            out.append("• %s · v%s · %s" % (device, ver_s, when_s))
            if info["findings"]:
                mark = "⚠" if info["severe"] else "•"
                out.append("   %s %s" % (mark, "; ".join(f["text"] for f in info["findings"])))
            else:
                out.append("   ✅ проблем в логе не видно")
        return "\n".join(out)

    def cmd_digest(self, user_id: int) -> str:
        if ADMINS and user_id not in ADMINS:
            return "Это команда для разработчика."
        day_ago = time.time() - 86400
        logs = [x for x in list_logs(limit=400) if x["epoch"] / 1000 >= day_ago]
        return self.digest_text(logs)

    def digest_text(self, logs) -> str:
        if not logs:
            return "За сутки новых логов нет."
        devices, bad = {}, []
        for entry in logs[:20]:
            device, ver, when = log_label(entry["path"])
            info = scan_log(fetch_log(entry), self.kb)
            devices[device] = devices.get(device, 0) + 1
            if info["severe"]:
                bad.append((device, info["version"] or ver or "?", info["findings"]))
        lines = ["📊 Сводка за сутки",
                 "Новых логов: %d, устройств: %d" % (len(logs), len(devices)),
                 "С проблемами: %d" % len(bad)]
        for device, ver, findings in bad[:10]:
            lines.append("• %s · v%s — %s" % (device, ver, "; ".join(f["text"] for f in findings[:3])))
        if not bad:
            lines.append("✅ проблем в логах не видно")
        return "\n".join(lines)

    # -- обработка сообщений ----------------------------------------------- #

    def reply(self, chat_id, text, reply_to=None, keyboard=None):
        try:
            self.tg.send(chat_id, text, reply_to=reply_to, keyboard=keyboard)
        except Exception as e:
            log("не смог ответить в %s: %s" % (chat_id, e))

    def handle_text(self, msg):
        chat = msg.get("chat") or {}
        user = msg.get("from") or {}
        chat_id = chat.get("id")
        user_id = user.get("id") or 0
        text = (msg.get("text") or msg.get("caption") or "").strip()
        if not chat_id or not text:
            return
        if user.get("is_bot"):
            return
        if not self.allowed(chat_id):
            log("чужой чат %s — пропускаю" % chat_id)
            return
        bot_user = (self.state.get("bot_username") or "").lower()
        is_group = (chat.get("type") or "private") in ("group", "supergroup")
        addressed = bool(bot_user) and (("@" + bot_user) in (text or "").lower()
                                        or ((msg.get("reply_to_message") or {}).get("from") or {}).get("username", "").lower() == bot_user)
        if (text or "").lstrip().startswith("/"):
            addressed = True          # команда — обращение к боту, даже без @
        if is_group and addressed:
            text = re.sub("@" + re.escape(bot_user), "", text, flags=re.I).strip()
        has_media = any(k in msg for k in ("photo", "document", "video"))
        if has_media:
            if not self.allow_reply(chat_id, user_id):
                return
            self.on_media(chat_id, user, msg, text)
            return
        if not self.allow_reply(chat_id, user_id):
            return

        if re.match(r"^(что|чо|чё|че)\s*нов(ого|ое|енького)?(?:$|[\s?!.,])", norm(text)):
            self.reply(chat_id, self.cmd_whatsnew(), msg.get("message_id"))
            return

        m = re.match(r"^/([A-Za-z_]+)(?:@\w+)?\s*(.*)$", text, re.S)
        if m:
            cmd, arg = m.group(1).lower(), m.group(2).strip()
            if cmd in ("start", "help", "menu"):
                self.reply(chat_id, self.cmd_help(), msg.get("message_id"), self.menu())
                return
            if cmd in ("whatsnew", "new", "changelog"):
                self.reply(chat_id, self.cmd_whatsnew(), msg.get("message_id"))
                return
            if cmd in ("version", "ver", "update", "apk"):
                text = self.cmd_version(user_id)
                kb = self.apk_keyboard(RELEASE.get()) if text.startswith("Последняя версия") else None
                self.reply(chat_id, text, msg.get("message_id"), kb)
                return
            if cmd in ("issues", "problems", "known"):
                self.reply(chat_id, known_list(self.kb), msg.get("message_id"))
                return
            if cmd == "id":
                self.reply(chat_id, "chat_id: %s\nтвой user_id: %s" % (chat_id, user_id),
                           msg.get("message_id"))
                return
            if cmd == "reply":
                if ADMINS and user_id not in ADMINS:
                    self.reply(chat_id, "Это команда для разработчика.")
                    return
                mm = re.match(r"^(-?\d+)\s+([\s\S]+)$", arg)
                if not mm:
                    self.reply(chat_id, "Как ответить: /reply <chat_id> <текст>.\n"
                                        "Или ответь (реплаем) на сообщение бота с вопросом.")
                    return
                try:
                    self.tg.send(int(mm.group(1)), "Ответ разработчика:\n\n" + mm.group(2).strip())
                    self.reply(chat_id, "Отправлено в чат %s ✅" % mm.group(1))
                except Exception as e:
                    self.reply(chat_id, "Не смог отправить (%s)." % e)
                return
            if cmd == "logs":
                self.reply(chat_id, self.cmd_logs(user_id, arg), msg.get("message_id"))
                return
            if cmd == "digest":
                self.reply(chat_id, self.cmd_digest(user_id), msg.get("message_id"))
                return
            if cmd == "check":
                text = arg or text
            else:
                self.reply(chat_id, "Не знаю такую команду. /help — что умею.")
                return

        # админ отвечает человеку, нажав «ответить» на уведомление бота
        replied = msg.get("reply_to_message") or {}
        if user_id in ADMINS and (replied.get("from") or {}).get("is_bot"):
            src = replied.get("text") or replied.get("caption") or ""
            mm = re.search(r"#r=(-?\d+)", src)
            if mm:
                target = int(mm.group(1))
                clean = re.sub(r"^/reply\s+", "", text).strip()
                if clean:
                    try:
                        self.tg.send(target, "Ответ разработчика:\n\n" + clean)
                        self.reply(chat_id, "Отправлено человеку в чат %s ✅" % target)
                    except Exception as e:
                        self.reply(chat_id, "Не смог отправить (%s)." % e)
                return

        issue, score = classify_scored(text, self.kb)

        # в группе молчим на «Ок/Эмм/Походу» и на всё, что не вопрос по теме
        if is_group:
            if is_noise(text):
                return
            if not addressed and (issue is None or score < 5):
                return

        if issue is None:
            self.reply(chat_id, "Пока не понял, что не работает.\n\n"
                                "Напиши по-простому:\n1) что делал;\n2) что случилось;\n"
                                "3) карта или танк (если в бою).\n\n"
                                "Или посмотри /issues — там список известного.", msg.get("message_id"))
            self.escalate(chat_id, chat.get("title"), user, text)
            return

        answer = render(issue, text)
        rel = RELEASE.get()
        wants_apk = bool(rel.get("apk")) and rel["apk"] in answer
        if REQUIRE_SUB and CHANNEL and wants_apk:
            if not self.is_subscribed(user_id):
                self.reply(chat_id, self.gate_text(), msg.get("message_id"), self.gate_keyboard())
                return
        if wants_apk:
            self.reply(chat_id, self.strip_apk(answer, rel), msg.get("message_id"),
                       self.apk_keyboard(rel))
        else:
            self.reply(chat_id, answer, msg.get("message_id"))

        version = parse_version(text)
        fixed = parse_version(issue.get("fixed_in") or "")
        regression = bool(fixed and version and version >= fixed)
        open_issue = issue_status(issue) == "open"
        if regression or open_issue or issue.get("severe"):
            self.escalate(chat_id, chat.get("title"), user, text, issue.get("ask") or "")

    def on_media(self, chat_id, user, msg, caption):
        """Скриншот пересылаем админам: это самое ценное, что может прислать человек."""
        if ADMINS:
            for admin in ADMINS:
                try:
                    self.tg.call("forwardMessage", chat_id=admin, from_chat_id=chat_id,
                                 message_id=msg.get("message_id"))
                except Exception as e:
                    log("не смог переслать вложение: %s" % e)
            who = "@%s" % user.get("username") if user.get("username") else (user.get("first_name") or "кто-то")
            for admin in ADMINS:
                try:
                    self.tg.send(admin, "📎 Вложение от %s (чат %s)%s"
                                 % (who, chat_id, ("\nПодпись: " + caption) if caption else ""))
                except Exception as e:
                    log("не смог предупредить админа: %s" % e)
            self.reply(chat_id, "Скриншот получил, передал разработчику ✅\n\n"
                                "Напиши в двух словах: что случилось и на какой карте (если в бою).",
                       msg.get("message_id"))
        else:
            self.reply(chat_id, "Скриншот вижу, но пересылать пока некому. Опиши проблему словами.",
                       msg.get("message_id"))

    def handle_callback(self, cq):
        data = cq.get("data") or ""
        chat_id = ((cq.get("message") or {}).get("chat") or {}).get("id")
        try:
            self.tg.call("answerCallbackQuery", callback_query_id=cq.get("id"))
        except Exception:
            pass
        if not chat_id:
            return
        if data.startswith("i:"):
            issue = next((i for i in self.kb.get("issues", []) if i.get("id") == data[2:]), None)
            if issue:
                self.reply(chat_id, render(issue, ""))
            else:
                self.reply(chat_id, "Такой темы нет. Напиши, что случилось, обычными словами.")
        elif data == "sub:check":
            uid = ((cq.get("from") or {}).get("id")) or 0
            if self.is_subscribed(uid):
                rel = RELEASE.get()
                self.reply(chat_id, "Готово ✅\n\nПоследняя версия: %s\n\nСтавить сверху, игру не удалять."
                           % rel.get("tag"), None, self.apk_keyboard(rel))
            else:
                self.reply(chat_id, "Пока не вижу подписки.\n\nПодпишись на канал и нажми «Я подписался» ещё раз.",
                           None, self.gate_keyboard())
        elif data == "b:new":
            self.reply(chat_id, self.cmd_whatsnew())
        elif data == "b:all":
            self.reply(chat_id, known_list(self.kb))

    # -- фоновые задачи ---------------------------------------------------- #

    def watch_logs(self):
        """Раз в 15 минут: новые логи. Если в них есть серьёзное — сообщить админу."""
        if not LOG_WATCH or not ADMINS:
            return
        now = time.time()
        if now - float(self.state.get("logs_checked", 0)) < 900:
            return
        self.state.set("logs_checked", now)
        self.state.save()
        logs = list_logs(limit=30)
        if self.first_watch:
            # первый запуск: запоминаем, что уже лежит, и молчим
            self.first_watch = False
            self.seen_logs = set(x["path"] for x in logs)
            self.state.set("seen_logs", sorted(self.seen_logs))
            self.state.save()
            return
        fresh = [x for x in logs if x["path"] not in self.seen_logs]
        if not fresh:
            return
        for entry in fresh[:3]:
            path = entry["path"]
            device, ver, when = log_label(path)
            info = scan_log(fetch_log(entry), self.kb)
            self.seen_logs.add(path)
            if info["severe"]:
                self.reply_to_admins("⚠ Новый лог с проблемой\n%s · v%s · %s\n%s"
                                     % (device, info["version"] or ver or "?", 
                                        when.strftime("%d.%m %H:%M") if when else "?",
                                        "; ".join(f["text"] for f in info["findings"])))
        self.seen_logs = set(list(self.seen_logs)[-2000:])
        self.state.set("seen_logs", sorted(self.seen_logs))
        self.state.save()

    def maybe_digest(self):
        if not ADMINS:
            return
        now = datetime.now(MSK)
        today = now.strftime("%Y-%m-%d")
        if now.hour < DIGEST_HOUR or self.digest_sent == today:
            return
        self.digest_sent = today
        self.state.set("digest_sent", today)
        self.state.save()
        try:
            day_ago = time.time() - 86400
            logs = [x for x in list_logs(limit=200) if x["epoch"] / 1000 >= day_ago]
            self.reply_to_admins(self.digest_text(logs))
        except Exception as e:
            log("сводка не удалась: %s" % e)

    def reply_to_admins(self, text: str):
        for admin in ADMINS:
            try:
                self.tg.send(admin, text)
            except Exception as e:
                log("не смог написать админу %s: %s" % (admin, e))


# --------------------------------------------------------------------------- #
# запуск
# --------------------------------------------------------------------------- #

_STOP = False


def _on_term(signum, frame):
    global _STOP
    _STOP = True


def run_poll(bot: Bot, tg: Telegram, state: State, minutes: int = 0) -> int:
    offset = int(state.get("offset", 0) or 0)
    deadline = time.time() + minutes * 60 if minutes else None
    last_save = 0.0
    log("poll: старт, offset=%s, минут=%s" % (offset, minutes or "∞"))
    while not _STOP:
        if deadline and time.time() > deadline:
            log("poll: время вышло")
            break
        try:
            updates = tg.call("getUpdates", http_timeout=65, offset=offset,
                              limit=50, timeout=50)
        except Exception as e:
            log("getUpdates: %s" % e)
            time.sleep(3)
            continue
        for u in updates or []:
            offset = max(offset, int(u.get("update_id", 0)) + 1)
            try:
                if u.get("callback_query"):
                    bot.handle_callback(u["callback_query"])
                elif u.get("message"):
                    bot.handle_text(u["message"])
            except Exception:
                log("ошибка обработки сообщения:\n" + traceback.format_exc())
            if _STOP:
                break
        if updates:
            state.set("offset", offset)
            if time.time() - last_save > 2:
                state.save()
                last_save = time.time()
        try:
            bot.watch_logs()
            bot.maybe_digest()
        except Exception:
            log("фоновая задача упала:\n" + traceback.format_exc())
    state.set("offset", offset)
    state.save()
    log("poll: остановлен, offset=%s" % offset)
    return 0


def run_once(bot: Bot, tg: Telegram, state: State) -> int:
    offset = int(state.get("offset", 0) or 0)
    try:
        updates = tg.call("getUpdates", http_timeout=35, offset=offset, limit=50, timeout=0)
    except Exception as e:
        log("getUpdates: %s" % e)
        return 0
    handled = 0
    for u in updates or []:
        offset = max(offset, int(u.get("update_id", 0)) + 1)
        try:
            if u.get("callback_query"):
                bot.handle_callback(u["callback_query"])
                handled += 1
            elif u.get("message"):
                bot.handle_text(u["message"])
                handled += 1
        except Exception:
            log("ошибка обработки сообщения:\n" + traceback.format_exc())
    state.set("offset", offset)
    state.save()
    try:
        bot.watch_logs()
        bot.maybe_digest()
    except Exception:
        log("фоновая задача упала:\n" + traceback.format_exc())
    log("once: обработано сообщений: %d, offset=%s" % (handled, offset))
    return 0


# --------------------------------------------------------------------------- #
# офлайн-проверки
# --------------------------------------------------------------------------- #

class FakeTelegram:
    def __init__(self):
        self.sent = []

    def send(self, chat_id, text, reply_to=None, keyboard=None):
        self.sent.append({"chat_id": chat_id, "text": text, "reply_to": reply_to})


def selftest() -> int:
    global RELEASE
    kb = load_kb()
    fails = []

    def check(name, ok, extra=""):
        if ok:
            print("PASS  " + name)
        else:
            print("FAIL  " + name + ((" | " + str(extra)) if extra else ""))
            fails.append(name)

    cases = [
        ("я за карту улетаю на рудниках", "map-collisions"),
        ("невидимые стены в чистом поле, упираюсь в воздух", "map-collisions"),
        ("фигловые коллизии, танк застревает", "map-collisions"),
        ("проезжаю сквозь дом", "map-collisions"),
        ("бой на пустом поле, нет домов", "map-missing"),
        ("нет знака классности", "mark-mastery"),
        ("мастера не дают", "mark-mastery"),
        ("внизу написано тренировочный бой", "training-label"),
        ("вылетает в ангаре после боя", "hangar-freeze"),
        ("крашит при заходе", "hangar-freeze"),
        ("vehicle not found 252", "vehicle-252"),
        ("висит синхронизация при входе", "sync-hang"),
        ("не работает магазин", "shop"),
        ("как обновить мод", "install"),
        ("не показали результаты боя", "results"),
        ("низкий фпс и лаги", "fps"),
        ("где кнопка меню мода", "mod-menu"),
        ("не работает взвод с другом", "platoon"),
        ("золото не начислили", "gold"),
        ("куда отправлять логи", "logs"),
        ("где скачать мод", "where-download"),
        ("дай ссылку на последнюю версию", "where-download"),
        ("а на айфон можно поставить", "ios"),
        ("это бесплатно?", "is-it-free"),
        ("а вирус там нет? забанят?", "safe"),
        ("нужен ли интернет чтобы играть", "internet"),
        ("потянет ли мой телефон, сколько памяти", "requirements"),
        ("мой аккаунт сохранится, прогресс не потеряю", "account"),
    ]
    for text, expected in cases:
        issue, score = classify(text, kb)
        got = (issue or {}).get("id")
        check("классификация: %r -> %s (score %d)" % (text[:38], expected, score),
              got == expected, "получилось %r" % got)

    for text in ("", "привет", "аааааа" * 800, "<b>test</b> & @@@", "6.58"):
        issue, score = classify(text, kb)
        check("не падает на мусоре: %r -> %s" % (text[:20], (issue or {}).get("id")), True)

    # версии
    fake_release = {"tag": "v6.59",
                    "apk": "https://example/APK659.apk",
                    "hotfix": "https://example/hotfix659.zip"}
    default_release = RELEASE.data
    RELEASE.data = fake_release
    RELEASE.at = time.time() + 10_000
    issue, _ = classify("улетаю за карту на рудниках", kb)
    old = render(issue, "улетаю за карту, версия 6.58")
    new = render(issue, "улетаю за карту, 6.59")
    check("старая версия: ответ велит обновиться и даёт ссылку",
          "APK659.apk" in old and "v6.59" in old, old[:80])
    check("новая версия: ответ просит скриншот, а не обновление",
          "скриншот" in new.lower() and "APK659" not in new, new[:80])
    issue2, _ = classify("нет знака классности", kb)
    check("знак: на 6.57 просит обновиться", "APK659" in render(issue2, "нет знака, 6.57"))
    check("знак: на 6.58 просит скриншот", "скриншот" in render(issue2, "нет знака, 6.58").lower())
    RELEASE.data = default_release
    RELEASE.at = 0

    # логи
    fixture = (APP_DIR / "tests" / "fixture_diag.txt")
    if fixture.exists():
        info = scan_log(fixture.read_text("utf-8"), kb)
        texts = " ".join(f["text"] for f in info["findings"])
        check("лог: нашёл «нет карты»", "без карты" in texts, texts)
        check("лог: нашёл «не было границ»", "границ" in texts, texts)
        check("лог: серьёзность отмечена", info["severe"] is True)
        check("лог: версия и карта вытащены",
              info["version"] == "6.58" and info["map"] == "rudniki",
              (info["version"], info["map"]))
    else:
        check("лог: фикстура на месте", False)

    # состояние
    tmp_state = STATE_DIR / "selftest_state.json"
    st = State(tmp_state)
    st.set("offset", 4242)
    st.save()
    st2 = State(tmp_state)
    check("состояние: offset пережил перезапуск", st2.get("offset") == 4242)
    try:
        tmp_state.unlink()
    except OSError:
        pass

    # деление длинного текста
    parts = split_text("x" * 9000)
    check("длинный текст режется на части < 4096", all(len(p) < 4096 for p in parts) and len(parts) >= 3)

    # пайплайн целиком на фейковом телеграме
    global TOKEN, ALLOWED_CHATS, ADMINS, COOLDOWN_SEC, MAX_PER_MIN
    cool_backup, max_backup = COOLDOWN_SEC, MAX_PER_MIN
    COOLDOWN_SEC, MAX_PER_MIN = 0, 100   # в проверке шлём подряд, лимит не должен мешать
    fake_tg = FakeTelegram()
    bot = Bot(kb, fake_tg, State(STATE_DIR / "selftest_state2.json"))
    msgs = [
        {"chat": {"id": 777, "title": "тест"}, "from": {"id": 1, "username": "tester"},
         "message_id": 10, "text": "/start"},
        {"chat": {"id": 777, "title": "тест"}, "from": {"id": 1, "username": "tester"},
         "message_id": 11, "text": "меня за карту выкидывает"},
        {"chat": {"id": 777, "title": "тест"}, "from": {"id": 2, "username": "botty", "is_bot": True},
         "message_id": 12, "text": "я бот"},
        {"chat": {"id": 777, "title": "тест"}, "from": {"id": 1, "username": "tester"},
         "message_id": 13, "text": "/id"},
    ]
    for m in msgs:
        bot.handle_text(m)
    sent = fake_tg.sent
    check("пайплайн: /start, вопрос и /id дали 3 ответа", len(sent) == 3, len(sent))
    check("пайплайн: на вопрос про карту ответ про v6.59",
          any("v6.59" in s["text"] or "карт" in s["text"] for s in sent), [s["text"][:40] for s in sent])
    check("пайплайн: бот-собеседник проигнорирован",
          all("я бот" not in s["text"] for s in sent))
    check("пайплайн: в /id есть chat_id", any("777" in s["text"] for s in sent))

    # «чужой чат» не отвечаем
    ALLOWED_CHATS = [777]
    bot2 = Bot(kb, FakeTelegram(), State(STATE_DIR / "selftest_state3.json"))
    bot2.handle_text({"chat": {"id": 999}, "from": {"id": 5}, "message_id": 1, "text": "привет"})
    check("чужой чат: молчит", bot2.tg.sent == [])
    ALLOWED_CHATS = []

    COOLDOWN_SEC, MAX_PER_MIN = cool_backup, max_backup
    for name in ("selftest_state2.json", "selftest_state3.json"):
        try:
            (STATE_DIR / name).unlink()
        except OSError:
            pass

    print()
    if fails:
        print("ПРОВАЛЕНО: %d" % len(fails))
        return 1
    print("Всё хорошо.")
    return 0


# --------------------------------------------------------------------------- #

def main(argv: list) -> int:
    global TOKEN
    mode = argv[1] if len(argv) > 1 else "poll"

    if mode == "selftest":
        return selftest()

    if mode == "issues":
        print(known_list(load_kb()))
        return 0

    if mode not in ("poll", "once"):
        print(__doc__)
        return 2

    if not TOKEN:
        print("Нет TELEGRAM_BOT_TOKEN. Положи его в .env рядом с bot.py или в переменные окружения.")
        return 2

    kb = load_kb()
    state = State(STATE_FILE)
    tg = Telegram(TOKEN)
    bot = Bot(kb, tg, state)

    try:
        me = tg.call("getMe")
        log("бот: @%s (%s)" % (me.get("username"), me.get("first_name")))
    except Exception as e:
        print("Телеграм не принял токен: %s" % e)
        return 2

    signal.signal(signal.SIGTERM, _on_term)
    signal.signal(signal.SIGINT, _on_term)

    if mode == "once":
        return run_once(bot, tg, state)

    minutes = 0
    if "--minutes" in argv:
        try:
            minutes = int(argv[argv.index("--minutes") + 1])
        except (ValueError, IndexError):
            minutes = 0
    while not _STOP:
        try:
            run_poll(bot, tg, state, minutes)
        except Exception:
            log("poll упал, перезапускаюсь через 5 с:\n" + traceback.format_exc())
            time.sleep(5)
        if minutes:
            break
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
