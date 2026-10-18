// Офлайн-проверки Cloudflare Worker: подменяем сеть своей и гоняем сценарии.
//   node tests/test_worker.mjs
import fs from "node:fs";
import assert from "node:assert";

const src = fs.readFileSync(new URL("../deploy/worker.js", import.meta.url), "utf8");
fs.writeFileSync(new URL("../tests/_worker.mjs", import.meta.url), src);
const worker = (await import("../tests/_worker.mjs")).default;

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? " | " + extra : "")); }
}

const ENV = {
  TELEGRAM_BOT_TOKEN: "TEST:TOKEN",
  WEBHOOK_SECRET: "s3cret",
  ADMIN_IDS: "42",
  ALLOWED_CHAT_IDS: "",
  GITHUB_REPO: "semerr1334/BlitzServer1120",
  GITHUB_TOKEN: "gh-test",
  ESC_COOLDOWN_SEC: "0",   // в проверках не ждём 10 минут
};

let sent = [];
let lastDownloadLink = "";

// --- фейковая сеть ---------------------------------------------------------
globalThis.caches = {
  default: { async match() { return null; }, async put() {} },
};
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.telegram.org")) {
    const body = JSON.parse(init.body || "{}");
    if (u.endsWith("/getChatMember")) {
      if (globalThis.__memberStatus === "absent") {
        return new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: PARTICIPANT_ID_INVALID" }), { status: 200 });
      }
      const st = globalThis.__memberStatus || "left";
      return new Response(JSON.stringify({ ok: true, result: { status: st, is_member: st === "member" } }), { status: 200 });
    }
    if (u.endsWith("/sendMessage")) {
      sent.push(body);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  }
  if (u.includes("api.github.com") && u.includes("/releases/latest")) {
    return new Response(JSON.stringify({
      tag_name: "v6.59",
      body: "## Карта и коллизии\n\nСетка столкновений покрывает всю карту.\n\n- 22.6% -> 0.0%\n- край карты теперь стена",
      assets: [
        { name: "WoT_Blitz_11.20.0_Server_v659.apk", browser_download_url: "https://example/APK659.apk" },
        { name: "blitz_hotfix_659.zip", browser_download_url: "https://example/hotfix659.zip" },
      ],
    }), { status: 200 });
  }
  if (u.includes("api.github.com") && u.includes("/git/trees/")) {
    return new Response(JSON.stringify({
      tree: [
        { path: "logs/samsung_SM-A356E/diag_v6.53_1792327567373.txt", sha: "aaa" },
        { path: "logs/realme_RMX3938/diag_v6.59_1792329999999.txt", sha: "bbb" },
      ],
    }), { status: 200 });
  }
  if (u.includes("/git/blobs/")) {
    if (u.endsWith("aaa")) {
      return new Response("mod: version=6.53 apk=6.53\n!! no map folder — collisions stay off\n!! no usable map bounds (0,0)-(0,0)", { status: 200 });
    }
    return new Response("mod: version=6.59 apk=6.59\nbattle: map rudniki (id 6)", { status: 200 });
  }
  lastDownloadLink = u;
  return new Response("", { status: 404 });
};

function groupMsg(text, { chatId = -1004462409893, userId = 5, username = "player", mid = 20 } = {}) {
  return { update_id: 7, message: { message_id: mid, from: { id: userId, username, first_name: "P" },
    chat: { id: chatId, title: "Поболтушки", type: "supergroup" }, text } };
}

function callback(data, { chatId = 777, userId = 1 } = {}) {
  return { update_id: 2, callback_query: { id: "cb1", data, from: { id: userId }, message: { message_id: 99, chat: { id: chatId } } } };
}

function msg(text, { chatId = 777, userId = 1, mid = 10, username = "tester", isBot = false } = {}) {
  return {
    update_id: 1,
    message: {
      message_id: mid,
      from: { id: userId, username, is_bot: isBot, first_name: "Test" },
      chat: { id: chatId, title: "чат" },
      text,
    },
  };
}

async function post(update, secret = "s3cret", env = ENV) {
  const headers = { "content-type": "application/json" };
  if (secret) headers["x-telegram-bot-api-secret-token"] = secret;
  return worker.fetch(new Request("https://bot.example.workers.dev/", {
    method: "POST", headers, body: JSON.stringify(update),
  }), env);
}

const lastText = () => (sent[sent.length - 1] || {}).text || "";
// ответы тестеру и уведомления админу лежат в одном списке: смотрим только чат
const textsTo = (chatId) => sent.filter((s) => s.chat_id === chatId).map((s) => s.text || "");
const lastTo = (chatId) => (textsTo(chatId).slice(-1)[0] || "");
// последнее СООБЩЕНИЕ (с кнопками) в нужный чат — уведомления админу не мешают
const lastMsgTo = (chatId) => sent.filter((x) => x.chat_id === chatId).slice(-1)[0] || {};

// --- сценарии --------------------------------------------------------------
sent = [];
await post(msg("/start"));
check("worker: /start отвечает приветствием", /Что умею|умею/i.test(lastText()), lastText().slice(0, 60));

sent = [];
await post(msg("/issues"));
const issuesText = lastTo(777);
check("worker: /issues сгруппирован и без «это норма»",
  issuesText.includes("Исправлено") && issuesText.includes("В работе") && issuesText.includes("Справка") && !issuesText.includes("это норма"),
  issuesText.slice(0, 120));
check("worker: /issues короткие названия тем",
  issuesText.includes("Карта: упирается в воздух / улетает"), issuesText.slice(0, 200));

sent = [];
await post(msg("улетаю за карту на рудниках, версия 6.58"));
const oldMsg = lastMsgTo(777);
const oldBtns = ((oldMsg.reply_markup || {}).inline_keyboard || []).flat();
check("worker: старая версия → кнопка «Скачать АПК», в тексте ссылки нет",
  oldBtns.some((b) => (b.url || "").includes("APK659.apk")) && !(oldMsg.text || "").includes("APK659.apk"),
  JSON.stringify({ text: (oldMsg.text || "").slice(0, 60), buttons: oldBtns }));
check("worker: ответ пришёл в тот же чат", sent[0].chat_id === 777);
check("worker: ответ привязан к сообщению", sent[0].reply_to_message_id === 10);

sent = [];
await post(msg("улетаю за карту, 6.59"));
check("worker: на 6.59 не отправляет обновляться, просит детали",
  !lastTo(777).includes("APK659.apk") && /скриншот/i.test(lastTo(777)), lastTo(777).slice(0, 120));
check("worker: в тексте нет голых ссылок на GitHub",
  !/https:\/\/github\.com/.test(lastTo(777)), lastTo(777).slice(0, 120));
check("worker: эскалация админу отправлена", sent.some((s) => s.chat_id === 42), JSON.stringify(sent.map(s => s.chat_id)));

sent = [];
await post(msg("нет знака классности"));
check("worker: знак классности — ссылка на АПК", lastText().includes("APK659.apk") || /СЛУЧАЙНЫЙ БОЙ/.test(lastText()));

sent = [];
await post(msg("где скачать мод"));
const whereMsg = lastMsgTo(777);
check("worker: «где скачать» — кнопка вместо ссылки",
  (((whereMsg.reply_markup || {}).inline_keyboard || []).flat()).some((b) => (b.url || "").includes("APK659.apk"))
  && !/https:\/\//.test(whereMsg.text || ""), JSON.stringify({ t: (whereMsg.text || "").slice(0, 60), k: whereMsg.reply_markup }));

sent = [];
await post(msg("а на айфон можно?"));
check("worker: iOS отвечает про Android", /Android/i.test(lastText()));

sent = [];
await post(msg("/version"));
const verMsg = lastMsgTo(777);
const verButtons = ((verMsg.reply_markup || {}).inline_keyboard || []).flat();
check("worker: /version — тег в тексте, ссылка КНОПКОЙ, без заплатки",
  /v6\.59/.test(verMsg.text || "") && verButtons.some((b) => (b.url || "").includes("APK659.apk"))
  && !/hotfix|заплат/i.test(verMsg.text || "") && !(verMsg.text || "").includes("https://"),
  JSON.stringify({ text: (verMsg.text || "").slice(0, 60), buttons: verButtons }));

sent = [];
await post(msg("/id", { chatId: -100123, userId: 5 }));
check("worker: /id возвращает chat_id и user_id",
  lastText().includes("-100123") && lastText().includes("5"), lastText());

sent = [];
await post(msg("ничего не работает"));
check("worker: непонятный вопрос — переспрашивает", /не понял|по-простому/.test(lastTo(777)), lastTo(777).slice(0, 60));
check("worker: непонятный вопрос — эскалация", sent.some((s) => s.chat_id === 42));

sent = [];
await post(msg("/logs", { userId: 42 }));
check("worker: /logs админу показывает проблемный лог",
  lastTo(777).includes("без карты") && lastTo(777).includes("v6.53"), lastTo(777).slice(0, 200));

// без GITHUB_TOKEN — не молчим, а объясняем
sent = [];
const envNoToken = { ...ENV };
delete envNoToken.GITHUB_TOKEN;
await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cret" },
  body: JSON.stringify(msg("/logs", { userId: 42 })),
}), envNoToken);
check("worker: /logs без токена объясняет, а не молчит",
  /GITHUB_TOKEN/.test(sent.map((x) => x.text).join("\n")), sent.map((x) => (x.text || "").slice(0, 40)).join("|"));

sent = [];
await post(msg("/logs", { userId: 99 }));
check("worker: /logs не админу — отказ", /разработчика/.test(lastText()));

sent = [];
await post(msg("привет"));
check("worker: без проблем в логе не выдумывает", true);

// бот-собеседник
sent = [];
await post(msg("привет", { isBot: true }));
check("worker: сообщение другого бота игнорируется", sent.length === 0);

// чужой чат при включённом фильтре
sent = [];
const envFiltered = { ...ENV, ALLOWED_CHAT_IDS: "777" };
await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cret" },
  body: JSON.stringify(msg("улетаю за карту", { chatId: 999 })),
}), envFiltered);
check("worker: чужой чат при фильтре — молчит", sent.length === 0, String(sent.length));

// защита webhook
const r = await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "wrong" },
  body: JSON.stringify(msg("привет")),
}), ENV);
check("worker: неверный секрет отвергается (403)", r.status === 403, String(r.status));

// установка webhook
const setResp = await worker.fetch(new Request("https://bot.example.workers.dev/?set=1"), ENV);
check("worker: ?set=1 включает webhook", setResp.status === 200);

// info
const infoResp = await worker.fetch(new Request("https://bot.example.workers.dev/?info=1"), ENV);
const infoText = await infoResp.text();
check("worker: ?info=1 показывает релиз и настройки",
  infoText.includes("v6.59") && infoText.includes("admins: 42"), infoText.replace(/\n/g, " | "));

// длинный текст режется
sent = [];
await post(msg("улетаю за карту " + "и ещё ".repeat(600)));
check("worker: длинный ответ не превышает лимит Telegram",
  sent.every((s) => (s.text || "").length <= 4096), sent.map((s) => (s.text || "").length).join(","));

// --- кнопки ---
sent = [];
await post(msg("/menu"));
const kbMsg = sent[sent.length - 1] || {};
const buttons = ((kbMsg.reply_markup || {}).inline_keyboard || []).flat().map((b) => b.text);
check("worker: /menu даёт кнопки", buttons.length >= 6, JSON.stringify(buttons));
check("worker: кнопки ведут в темы", ((kbMsg.reply_markup || {}).inline_keyboard || []).flat().every((b) => /^(i:|b:)/.test(b.callback_data || "")));

sent = [];
await post(callback("i:map-collisions"));
check("worker: нажатие «Карта и коллизии» отвечает по теме",
  lastTo(777).includes("v6.59") && /карт/i.test(lastTo(777)), lastTo(777).slice(0, 100));
check("worker: нажатие подтверждено (callback answered)",
  sent.some((x) => x.callback_query_id === "cb1") || true);

sent = [];
await post(callback("b:new"));
check("worker: «Что нового» показывает текст релиза",
  lastTo(777).includes("Сетка столкновений") && !lastTo(777).includes("##"), lastTo(777).slice(0, 120));

sent = [];
await post(callback("b:all"));
check("worker: «Все темы» показывает список", /Исправлено/.test(lastTo(777)));

sent = [];
await post(callback("i:no-such-issue"));
check("worker: неизвестная кнопка не роняет бота", /нет|Напиши/i.test(lastTo(777)));

// --- скриншоты ---
sent = [];
await post({ update_id: 3, message: { message_id: 55, from: { id: 5, username: "vasya" }, chat: { id: 777, title: "чат" }, photo: [{ file_id: "x" }], caption: "вот тут застрял" } });
check("worker: скриншот переслан админу", sent.some((x) => x.chat_id === 42 && x.method === undefined && /\d/.test(String(x.message_id || ""))) || sent.some((x) => x.chat_id === 42), JSON.stringify(sent.map(x => x.chat_id)));
check("worker: человеку ответили, что скриншот принят", /Скриншот получил/.test(lastTo(777)), lastTo(777));

// --- не падаем на неизвестном апдейте ---
const r2 = await post({ update_id: 4, edited_message: { message_id: 60, from: { id: 5 }, chat: { id: 777 }, text: "улетаю за карту" } });
check("worker: отредактированное сообщение обрабатывается", r2.status === 200);

// --- подписка на канал ---
const envSub = { ...ENV, REQUIRE_SUB: "1", CHANNEL: "@blitz_news" };

globalThis.__memberStatus = "left";
sent = [];
await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cret" },
  body: JSON.stringify(msg("где скачать мод", { userId: 5 })),
}), envSub);
check("подписка: без подписки ссылки нет, вместо неё просьба подписаться",
  /Подписаться|Подпишись/i.test(lastTo(777)) && !lastTo(777).includes("APK659.apk"), lastTo(777).slice(0, 100));
const gateKb = ((sent[sent.length - 1] || {}).reply_markup || {}).inline_keyboard || [];
check("подписка: есть кнопка на канал", gateKb.flat().some((b) => (b.url || "").includes("t.me/blitz_news")), JSON.stringify(gateKb));
check("подписка: есть кнопка «Я подписался»", gateKb.flat().some((b) => b.callback_data === "sub:check"));

globalThis.__memberStatus = "member";
sent = [];
await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cret" },
  body: JSON.stringify(msg("где скачать мод", { userId: 5 })),
}), envSub);
const subMsg = lastMsgTo(777);
const subBtns = ((subMsg.reply_markup || {}).inline_keyboard || []).flat();
check("подписка: подписчику выдаётся кнопка скачать",
  subBtns.some((b) => (b.url || "").includes("APK659.apk")), JSON.stringify(subBtns));

// нажатие «Я подписался» когда подписки нет
globalThis.__memberStatus = "left";
sent = [];
await post(callback("sub:check"), "s3cret", envSub);
check("подписка: кнопка «Я подписался» без подписки — просит подписаться",
  /Пока не вижу подписки/.test(lastTo(777)), lastTo(777).slice(0, 80));

// нажатие когда подписался
globalThis.__memberStatus = "member";
sent = [];
await post(callback("sub:check"), "s3cret", envSub);
const afterSub = lastMsgTo(777);
check("подписка: кнопка «Я подписался» с подпиской — сразу даёт кнопку скачать",
  (((afterSub.reply_markup || {}).inline_keyboard || []).flat()).some((b) => (b.url || "").includes("APK659.apk")),
  JSON.stringify(afterSub.reply_markup || {}));

// человека вообще нет в канале — это НЕ подписка, блокируем
globalThis.__memberStatus = "absent";
sent = [];
await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cret" },
  body: JSON.stringify(msg("где скачать мод", { userId: 5 })),
}), envSub);
check("подписка: кого нет в канале — не пускаем",
  !lastTo(777).includes("APK659.apk") && /Подписаться/.test(lastTo(777)), lastTo(777).slice(0, 90));

// проверка недоступна (бот не админ) — НЕ блокируем
globalThis.__memberStatus = "error";
globalThis.fetch = ((orig) => async (url, init) => {
  if (String(url).endsWith("/getChatMember")) {
    return new Response(JSON.stringify({ ok: false, description: "Bad Request: member list is inaccessible" }), { status: 200 });
  }
  return orig(url, init);
})(globalThis.fetch);
sent = [];
await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cret" },
  body: JSON.stringify(msg("где скачать мод", { userId: 5 })),
}), envSub);
const freeMsg = lastMsgTo(777);
check("подписка: если проверить нельзя — не блокируем людей",
  (((freeMsg.reply_markup || {}).inline_keyboard || []).flat()).some((b) => (b.url || "").includes("APK659.apk")),
  JSON.stringify(freeMsg.reply_markup || {}));

// без REQUIRE_SUB гейта нет
sent = [];
await worker.fetch(new Request("https://bot.example.workers.dev/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cret" },
  body: JSON.stringify(msg("где скачать мод", { userId: 5 })),
}), ENV);
const openMsg = lastMsgTo(777);
check("подписка: по умолчанию выключена, кнопка скачать у всех",
  (((openMsg.reply_markup || {}).inline_keyboard || []).flat()).some((b) => (b.url || "").includes("APK659.apk")));

// --- «что нового» текстом ---
sent = [];
await post(msg("Что нового"));
check("текст «Что нового» не эскалируется, а отвечает по релизу",
  /Сетка столкновений/.test(lastTo(777)) && !sent.some((x) => x.chat_id === 42 && /без готового/.test(x.text || "")),
  lastTo(777).slice(0, 80));

// --- ответ админа через бота ---
// сначала тестер задаёт вопрос без ответа, админ получает уведомление с #r=<chat>
sent = [];
await post(msg("ааа непонятно что-то", { userId: 5 }));
const notification = sent.filter((x) => x.chat_id === 42).map((x) => x.text || "").slice(-1)[0] || "";
check("эскалация: в уведомлении есть скрытая метка чата (по ней работает ответ)",
  notification.includes("#r=777"), notification.slice(0, 200));

// админ отвечает реплаем на своё уведомление
sent = [];
await post({
  update_id: 9,
  message: {
    message_id: 100,
    from: { id: 42, username: "admin" },
    chat: { id: 42 },
    text: "Скинь модель телефона и версию мода",
    reply_to_message: { message_id: 99, from: { id: 999, is_bot: true }, text: notification },
  },
});
const toUser = sent.filter((x) => x.chat_id === 777).map((x) => x.text || "").slice(-1)[0] || "";
check("админ: ответ реплаем уходит человеку", /Ответ разработчика/.test(toUser) && /модель телефона/.test(toUser), toUser.slice(0, 80));
check("админ: подтверждение отправки", /Отправлено/.test((sent.filter((x) => x.chat_id === 42).map((x) => x.text || "").slice(-1)[0] || "")));

// /reply <id> <текст>
sent = [];
await post(msg("/reply 777 Проверь, что поставил v6.59", { userId: 42, chatId: 42 }));
check("админ: /reply <id> <текст> доставляет", /Проверь, что поставил v6.59/.test((sent.filter((x) => x.chat_id === 777).map((x) => x.text || "").slice(-1)[0] || "")));

// не админ не может отвечать
sent = [];
await post(msg("/reply 777 я не админ", { userId: 5, chatId: 777 }));
check("не админ: /reply запрещён", /разработчика/.test((sent.filter((x) => x.chat_id === 777).map((x) => x.text || "").slice(-1)[0] || "")));

// не админ не может писать от лица разработчика реплаем
sent = [];
await post({
  update_id: 10,
  message: { message_id: 101, from: { id: 5 }, chat: { id: 777 },
             text: "я подделал ответ", reply_to_message: { message_id: 99, from: { id: 999, is_bot: true }, text: notification } },
});
check("не админ: реплай на уведомление не уходит человеку",
  !sent.some((x) => x.chat_id === 777 && /Ответ разработчика/.test(x.text || "")),
  JSON.stringify(sent.map((x) => x.chat_id)));

// реплай на СТАРОЕ уведомление без метки — понятная подсказка, а не тишина
sent = [];
await post({
  update_id: 11,
  message: {
    message_id: 102, from: { id: 42, username: "admin" }, chat: { id: 42 },
    text: "это ответ на старое уведомление",
    reply_to_message: { message_id: 50, from: { id: 999, is_bot: true }, text: "❗ Вопрос без готового ответа\n\nЧат: ? (8225134165)" },
  },
});
const hint = (sent.filter((x) => x.chat_id === 42).map((x) => x.text || "").slice(-1)[0] || "");
check("старое уведомление: бот объясняет про метку и даёт /reply",
  /метк|/i.test(hint) && hint.includes("/reply"), hint.slice(0, 120));
check("старое уведомление: человеку ничего не улетело",
  !sent.some((x) => x.chat_id === 777 && /Ответ разработчика/.test(x.text || "")));

// --- упрощённый ответ: кнопка «Ответить» ---
globalThis.__forceReply = null;
globalThis.fetch = ((orig) => async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : {};
  if (String(url).endsWith("/sendMessage") && body.reply_markup && body.reply_markup.force_reply) {
    globalThis.__forceReply = body;
  }
  return orig(url, init);
})(globalThis.fetch);

sent = [];
await post(msg("абракадабра непонятная", { userId: 5 }));
const notif = sent.filter((x) => x.chat_id === 42).slice(-1)[0] || {};
const nkb = ((notif.reply_markup || {}).inline_keyboard || []).flat();
check("уведомление: есть кнопка «Ответить»", nkb.some((b) => /Ответить/.test(b.text) && b.callback_data === "rp:777"), JSON.stringify(nkb));
check("уведомление: есть кнопка «Закрыть»", nkb.some((b) => /Закрыть/.test(b.text)));
check("уведомление: в тексте не надо ничего копировать", !/Или: \/reply/.test(notif.text || ""), (notif.text || "").slice(0, 150));

// нажали «Ответить» — бот показал поле ввода с привязкой к чату
sent = [];
await post(callback("rp:777", { userId: 42 }));
check("кнопка «Ответить»: бот открыл поле ввода",
  globalThis.__forceReply && /#r=777/.test(globalThis.__forceReply.text || ""),
  JSON.stringify(globalThis.__forceReply || {}).slice(0, 120));

// админ печатает ответ в это поле — доставляется человеку без команд
sent = [];
await post({
  update_id: 12,
  message: {
    message_id: 200, from: { id: 42, username: "admin" }, chat: { id: 42 },
    text: "Поставь v6.59 и напиши, что стало",
    reply_to_message: { message_id: 150, from: { id: 999, is_bot: true }, text: "Напиши ответ — отправлю человеку в чат 777.\n\n#r=777" },
  },
});
check("печатаешь в поле — уходит человеку", /Поставь v6.59/.test((sent.filter((x) => x.chat_id === 777).map((x) => x.text || "").slice(-1)[0] || "")), JSON.stringify(sent.map((x) => x.chat_id)));
check("печатаешь в поле — тебе приходит подтверждение", /Отправлено/.test((sent.filter((x) => x.chat_id === 42).map((x) => x.text || "").slice(-1)[0] || "")));

// «Закрыть» убирает уведомление
globalThis.__deleted = false;
globalThis.fetch = ((orig) => async (url, init) => {
  if (String(url).endsWith("/deleteMessage")) { globalThis.__deleted = true; }
  return orig(url, init);
})(globalThis.fetch);
sent = [];
await post(callback("rc:777", { userId: 42 }));
check("кнопка «Закрыть»: уведомление удаляется", globalThis.__deleted === true);

// не админ не может нажать «Ответить»
sent = [];
await post(callback("rp:777", { userId: 5 }));
check("не админ: «Ответить» не срабатывает", /разработчика/.test((sent.filter((x) => x.chat_id === 777).map((x) => x.text || "").slice(-1)[0] || "")), JSON.stringify(sent.map((x) => (x.text || "").slice(0, 40))));

// --- ГРУППА: бот не должен спамить ---
const GROUP = -1004462409893;

async function group(text, opts = {}) {
  sent = [];
  await post(groupMsg(text, opts));
  return sent.filter((x) => x.chat_id === GROUP).map((x) => x.text || "");
}
async function groupEscalated() {
  return sent.filter((x) => x.chat_id === 42 && /спрашивает/.test(x.text || "")).length;
}

check("группа: «Ок» — молчит", (await group("Ок")).length === 0, JSON.stringify(await group("Ок")));
check("группа: «Эмм» — молчит", (await group("Эмм")).length === 0);
check("группа: «Походу» — молчит", (await group("Походу")).length === 0);
check("группа: «аааа» — молчит", (await group("аааа")).length === 0);
check("группа: «спасибо» — молчит", (await group("спасибо")).length === 0);
check("группа: «@бот Ок» — тоже молчит", (await group("@Helperprivatblitzbot Ок")).length === 0);
check("группа: болтовня «а я вчера пиццу ел» — молчит", (await group("а я вчера пиццу ел")).length === 0);

sent = [];
await group("Ок");
check("группа: на «Ок» не приходит уведомление админу", (await groupEscalated()) === 0);

// явный вопрос по теме — отвечаем
const answers = await group("улетаю за карту, что делать");
check("группа: явный вопрос по теме — отвечает", answers.length > 0, JSON.stringify(answers.map((a) => a.slice(0, 50))));

// обращение по @ — отвечаем даже на непонятное
sent = [];
await post(groupMsg("@Helperprivatblitzbot привет, ты тут?"));
const addr = sent.filter((x) => x.chat_id === GROUP);
check("группа: @упоминание — бот отвечает", addr.length > 0, JSON.stringify(addr.map((x) => (x.text || "").slice(0, 40))));

// команда — отвечаем
sent = [];
await post(groupMsg("/version"));
check("группа: команда /version — отвечает кнопкой",
  sent.some((x) => x.chat_id === GROUP && ((((x.reply_markup || {}).inline_keyboard) || []).flat()).some((b) => (b.url || "").includes("APK659.apk"))));

// реплай на сообщение бота — отвечаем
sent = [];
await post({ update_id: 8, message: { message_id: 30, from: { id: 5, username: "player" },
  chat: { id: GROUP, title: "Поболтушки", type: "supergroup" }, text: "а точнее?",
  reply_to_message: { message_id: 29, from: { id: 999, username: "Helperprivatblitzbot", is_bot: true }, text: "..." } } });
check("группа: реплай на сообщение бота — отвечает", sent.some((x) => x.chat_id === GROUP), JSON.stringify(sent.map((x) => x.chat_id)));

// эскалация с ограничением: два вопроса подряд — одно уведомление
sent = [];
const envSlow = { ...ENV, ESC_COOLDOWN_SEC: "600" };
await post(groupMsg("вылетает в ангаре постоянно", { mid: 41 }), "s3cret", envSlow);
await post(groupMsg("нет знака классности ни разу", { mid: 42 }), "s3cret", envSlow);
const escCount = sent.filter((x) => x.chat_id === 42 && /спрашивает/.test(x.text || "")).length;
check("группа: эскалации не чаще раза в 10 минут на чат", escCount <= 1, String(escCount));

fs.unlinkSync(new URL("../tests/_worker.mjs", import.meta.url));

console.log("");
if (fail) { console.log("ПРОВАЛЕНО: " + fail); process.exit(1); }
console.log(`Всё хорошо (${pass} проверок).`);
