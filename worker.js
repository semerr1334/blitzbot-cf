// BlitzBot for Cloudflare Workers — бесплатный вариант без сервера.
// Файл собирается скриптом tools/make_worker.py из kb.json; руками не править.
//
// Переменные окружения (Settings -> Variables and Secrets):
//   TELEGRAM_BOT_TOKEN  — токен бота (Secret)
//   WEBHOOK_SECRET      — любая строка, защищает webhook (Secret)
//   ADMIN_IDS           — твой user id через запятую (эскалации, /logs, /digest)
//   ALLOWED_CHAT_IDS    — id чатов через запятую (пусто = любой чат)
//   GITHUB_REPO         — semerr1334/BlitzServer1120
//   GITHUB_TOKEN        — read-only токен GitHub (Secret) — нужен, чтобы читать приватные логи
//
// Установка: открыть https://<worker>.workers.dev/?set=1 — пропишет webhook.
// Проверка:  https://<worker>.workers.dev/?info=1

const KB = {"issues":[{"id":"where-download","title":"Где скачать мод / откуда брать обновления","short":"Где скачать мод","status":"info","fixed_in":null,"severe":false,"strong":["где скачать","откуда скачать","ссылка на мод","где взять мод","как скачать","дай ссылку"],"keywords":["скачать","мод","apk","ссылк"],"answer":"Качать только отсюда (там всегда последняя версия):\n{apk}\n\nСтавится сверху, игру удалять не надо. Другие сайты и «сборки» — не наши, за них не отвечаю.","answer_after_fix":null,"ask":null},{"id":"ios","title":"Можно ли на iPhone / iOS","short":"iPhone / iOS","status":"deferred","fixed_in":null,"severe":false,"strong":["айфон","iphone","иос"," ios","на яблок"],"keywords":["телефон","андроид","android"],"answer":"Нет, только Android. На iPhone поставить нельзя — мод работает как отдельное приложение на Android (7.0 и новее).","answer_after_fix":null,"ask":null},{"id":"is-it-free","title":"Это бесплатно? Есть подписка?","short":"Бесплатно?","status":"info","fixed_in":null,"severe":false,"strong":["бесплатн","подписк","платн","за деньг","сколько стоит"],"keywords":["донат","деньги","оплат"],"answer":"Бесплатно. Ни подписки, ни рекламы, ни обязательных платежей.\n\nДонат — по желанию, на нём ничего не держится. Все танки, золото и кредиты и так открыты.","answer_after_fix":null,"ask":null},{"id":"safe","title":"Это безопасно? Не забанят? Не вирус?","short":"Безопасно? Забанят?","status":"info","fixed_in":null,"severe":false,"strong":["вирус","безопасн","антивирус","забан","бан ","заблокир"],"keywords":["аккаунт","вг","wargaming","пароль"],"answer":"Мод отдельное приложение, не лезет в твой аккаунт Wargaming и не просит пароль.\n\nЛоги (что упало и на какой карте) уходят на сервер разработчика — без паролей и без личных данных. Всё остальное остаётся на телефоне.","answer_after_fix":null,"ask":null},{"id":"internet","title":"Нужен ли интернет","short":"Нужен интернет?","status":"info","fixed_in":null,"severe":false,"strong":["нужен ли интернет","нужен интернет","без интернета","офлайн","оффлайн","нет сети","интернет"],"keywords":["интернет","сеть","вайфай","wi-fi"],"answer":"Играть можно без интернета — бои идут на телефоне.\n\nИнтернет нужен только чтобы догрузить файлы карты в первый раз и чтобы логи ушли разработчику.","answer_after_fix":null,"ask":null},{"id":"requirements","title":"Какие требования / потянет ли телефон","short":"Требования к телефону","status":"info","fixed_in":null,"severe":false,"strong":["какой андроид","версия андроид","потянет","сколько памят","сколько мест","требован"],"keywords":["андроид","android","память","место","гб"],"answer":"Android 7.0 и новее, ARM64, примерно 2.5 ГБ свободного места.\n\nЕсли телефон слабый — поставь графику пониже в настройках мода: ФПС вырастет.","answer_after_fix":null,"ask":null},{"id":"account","title":"Мой аккаунт и прогресс: сохранится?","short":"Аккаунт и прогресс","status":"info","fixed_in":null,"severe":false,"strong":["мой аккаунт","прогресс","мои танки","сохран","перенес"],"keywords":["аккаунт","профиль","данные"],"answer":"У мода свой отдельный профиль — аккаунт Wargaming не трогается, прогресс в официальной игре остаётся как был.\n\nПри обновлении сверху твой профиль в моде сохраняется.","answer_after_fix":null,"ask":null},{"id":"map-collisions","title":"Карта и коллизии: танк упирается в воздух, улетает за карту, проезжает сквозь","short":"Карта: упирается в воздух / улетает","status":"fixed","fixed_in":"6.59","severe":true,"strong":["коллизи","невидим","за карту","за край карты","сквозь стен","сквозь дом","пустое место","фиглов"],"keywords":["улета","провалива","застрева","упёрся","уперся","проезжа","стен","упирает"],"answer":"Это чинил в v6.59.\n\nЕсли у тебя версия ниже — поставь новый АПК сверху, игру не удаляй:\n{apk}\n\nЕсли уже v6.59, а всё равно упираешься в воздух или улетаешь — значит я не нашёл твой случай. Пришли: название карты + скриншот места (где стоишь и куда не едет). Этого хватит.","answer_after_fix":"На v6.59 этого быть не должно — значит я не поймал именно твой случай.\n\nПришли, пожалуйста:\n1) название карты;\n2) скриншот места, где стоишь;\n3) что происходит: упирается в воздух / проезжает сквозь / улетаешь за край.","ask":"название карты, скриншот места и что именно происходит (упирается / проезжает сквозь / улетает)"},{"id":"map-missing","title":"Бой на пустом поле: нет домов, нет рельефа, «карта не загрузилась»","short":"Пустое поле вместо карты","status":"fixed","fixed_in":"6.59","severe":true,"strong":["без карты","пустая карта","нет карты","серое поле","нет домов","пустое поле","голая карта"],"keywords":["карта","поле","пусто","рельеф"],"answer":"Это была одна из причин «улетаю за карту»: бой иногда шёл вообще без карты — без рельефа и без стен. Починил в v6.59.\n\nОбнови АПК сверху, игру не удаляй:\n{apk}","answer_after_fix":"На v6.59 бой без карты быть не должен. Пришли скриншот начала боя и название карты (если видно) — разберу.","ask":"скриншот начала боя и что написано/видно"},{"id":"mark-mastery","title":"Нет знака классности / не дают «Мастера» / медали","short":"Нет знака классности / медалей","status":"fixed","fixed_in":"6.58","severe":false,"strong":["знак класс","мастер","медал","награ","значок"],"keywords":["не дают","не рисует","нет","классност"],"answer":"Знак классности починили в v6.58: бой помечался как тренировочный, а в тренировочных награды не рисуются.\n\nВнизу окна результатов должно быть «СЛУЧАЙНЫЙ БОЙ». Если у тебя версия ниже — обнови:\n{apk}","answer_after_fix":"Пришли, пожалуйста, скриншот окна результатов целиком (видно низ окна и полосу наград) + танк, урон и фраги. Посмотрю, что не посчиталось.","ask":"скриншот результатов, танк, урон и фраги"},{"id":"training-label","title":"Внизу результатов написано «ТРЕНИРОВОЧНЫЙ БОЙ»","short":"Внизу «ТРЕНИРОВОЧНЫЙ БОЙ»","status":"fixed","fixed_in":"6.58","severe":false,"strong":["тренировочный бой","тренировочн"],"keywords":["внизу","надпись","режим","написано"],"answer":"Это и был баг: бой уходил как тренировочный, поэтому не рисовались награды. Починено в v6.58 — внизу должно быть «СЛУЧАЙНЫЙ БОЙ».\n\nОбнови АПК сверху:\n{apk}","answer_after_fix":"Значит метка вернулась. Пришли скриншот низа окна результатов — разберу.","ask":"скриншот низа окна результатов"},{"id":"hangar-freeze","title":"Вылеты, фризы, закрывается игра (особенно в ангаре)","short":"Вылеты и фризы","status":"open","fixed_in":null,"severe":true,"strong":["вылет","краш","закрыва","фриз","зависа","выкидыва","ангар"],"keywords":["перезапуск","чёрный экран","черный экран","после боя","перед боем","9-10","9-10 уровень"],"answer":"Про вылеты и фризы знаю, это отдельная задача (не карта), пока в работе.\n\nЧтобы не терять время, пришли:\n1) модель телефона;\n2) версию мода (в меню мода);\n3) что делал перед вылетом — открыл магазин / вышел из боя / свернул игру / ждал бой.\n\nЛоги приходят сами, их отправлять не надо.","answer_after_fix":null,"ask":"модель телефона, версия мода и что делал перед вылетом"},{"id":"vehicle-252","title":"«Vehicle not found 252» / танк не находится","short":"Vehicle not found 252","status":"open","fixed_in":null,"severe":false,"strong":["vehicle not found","252"],"keywords":["танк не находит","не находится танк","not found"],"answer":"«Vehicle not found 252» знаю. Пока не чинил — руки не дошли, это не карта.\n\nЕсли повторится — напиши, какой танк и что открывал перед этим (ангар, камо, бой).","answer_after_fix":null,"ask":"какой танк и что открывал перед ошибкой"},{"id":"sync-hang","title":"Висит синхронизация / не заходит в игру","short":"Висит синхронизация / не входит","status":"info","fixed_in":null,"severe":false,"strong":["синхронизац","не заходит","не могу зайти","висит загрузк","бесконечная загрузк","не грузит"],"keywords":["вход","логин","крутится","шестерёнка","шестеренка","чёрный экран","черный экран"],"answer":"Если висит синхронизация или не пускает в игру:\n\n1) проверь, что мод той же версии, что игра (видно в меню мода);\n2) выключи игру полностью (не свернуть) и запусти заново;\n3) если не помогло — поставь АПК сверху ещё раз, игру не удаляй:\n{apk}\n\nНапиши, что именно видно: чёрный экран, «синхронизация данных», крутится шестерёнка.","answer_after_fix":null,"ask":"что именно видно на экране и модель телефона"},{"id":"shop","title":"Магазин / аукцион не работает","short":"Магазин и аукцион","status":"deferred","fixed_in":null,"severe":false,"strong":["магазин","аукцион","магази"],"keywords":["покупк","купить","не работает"],"answer":"Магазин и аукцион отключены намеренно — они заморожены, я их не трогаю.\n\nЭто не поломка. Всё остальное (танки, бои, награды) работает.","answer_after_fix":null,"ask":null},{"id":"install","title":"Как обновить / не устанавливается АПК","short":"Как обновить / установка","status":"info","fixed_in":null,"severe":false,"strong":["как обнов","ставить сверху","не устанавлива","ошибка установки","при установке","не ставится"],"keywords":["apk","обновлен","установ","версия"],"answer":"Обновление ставится СВЕРХУ, игру удалять не надо:\n{apk}\n\nАккаунт, танки и награды останутся — это мод, а не отдельная игра.\n\nЕсли при установке ругается — пришли модель телефона и текст ошибки.","answer_after_fix":null,"ask":"модель телефона и текст ошибки при установке"},{"id":"results","title":"Результаты боя: пусто, не показались, награды не пришли","short":"Результаты боя / награды","status":"info","fixed_in":null,"severe":false,"strong":["результаты боя","после боя","награды не","не показали результаты"],"keywords":["опыт","кредит","не пришли","пустое окно"],"answer":"Если окно результатов не появилось или пустое — напиши:\n1) какой бой (случайный / тренировочный);\n2) танк;\n3) что написано внизу окна.\n\nЛоги приходят сами, приложи скриншот — так быстрее.","answer_after_fix":null,"ask":"скриншот окна результатов, танк и тип боя"},{"id":"fps","title":"Лаги, низкий ФПС, тормозит","short":"Лаги и низкий ФПС","status":"open","fixed_in":null,"severe":false,"strong":["фпс","fps","лаги","тормоз","просадк","фризит"],"keywords":["низкий","медленно","дёргается","дергается"],"answer":"Лаги и просадки ФПС — отдельная задача, не карта.\n\nНапиши модель телефона и когда именно тормозит: ангар / начало боя / бой / результаты. И сколько примерно ФПС.","answer_after_fix":null,"ask":"модель телефона, когда тормозит и сколько ФПС"},{"id":"mod-menu","title":"Не открывается меню мода / нет кнопки","short":"Меню мода / кнопка","status":"info","fixed_in":null,"severe":false,"strong":["меню мода","кнопк"],"keywords":["мод","меню","не открыва"],"answer":"Кнопка мода — в ангаре (кружок/иконка на экране).\n\nЕсли её нет:\n1) проверь, что мод запущен (уведомление в шторке);\n2) полностью закрой игру и запусти снова;\n3) если не помогло — поставь АПК сверху ещё раз:\n{apk}\n\nНапиши модель телефона и версию мода.","answer_after_fix":null,"ask":"модель телефона и версия мода"},{"id":"platoon","title":"Взводы, роты, LAN, игра с друзьями","short":"Взводы, роты, LAN","status":"deferred","fixed_in":null,"severe":false,"strong":["взвод","рота","лан"," lan","lan "],"keywords":["друз","приглаш","вместе","кооп"],"answer":"Взводы, роты и LAN пока отложены — сейчас играется один, случайный бой с ботами.\n\nЕсли нужно с другом — пока только по очереди на одном устройстве.","answer_after_fix":null,"ask":null},{"id":"gold","title":"Золото, кредиты, свободный опыт","short":"Золото, кредиты, опыт","status":"info","fixed_in":null,"severe":false,"strong":["золот","кредит","свободн опыт"],"keywords":["999","начисли","баланс","не видно"],"answer":"Золото, кредиты и свободный опыт начисляются по 999 000 000 — это норма.\n\nЕсли не видно: полностью закрой игру и запусти заново. Если всё равно нет — напиши, где смотришь (профиль, ангар, магазин).","answer_after_fix":null,"ask":"где смотришь баланс и скриншот"},{"id":"logs","title":"Куда отправлять логи","short":"Куда отправлять логи","status":"info","fixed_in":null,"severe":false,"strong":["куда отправ","как отправить лог","прислать лог","диагностик"],"keywords":["лог","логи","diag"],"answer":"Логи уходят сами — отправлять ничего не надо.\n\nГлавное: запусти игру с модом и поиграй пару минут, чтобы лог записался. Дальше он сам уйдёт на сервер, я его увижу.","answer_after_fix":null,"ask":null}],"log_signatures":[{"match":"no map folder","text":"бой прошёл без карты (не нашлась папка карты)","severe":true},{"match":"collisions stay off","text":"столкновения были выключены","severe":true},{"match":"no usable map bounds","text":"не было границ карты","severe":true},{"match":"no scene for","text":"не нашлась сцена карты","severe":true},{"match":"no collision grid","text":"не построилась сетка столкновений","severe":true},{"match":"did not rasterize","text":"сцена карты не разобралась","severe":true},{"match":"OutOfMemory","text":"не хватило памяти","severe":true},{"match":"FATAL","text":"фатальная ошибка","severe":true},{"match":"Exception","text":"исключение в логе","severe":false},{"match":"!! ","text":"предупреждения сервера","severe":false}]};

// Запасной вариант, если GitHub API недоступен или упёрлись в лимит:
// сборка кладёт сюда ссылки последнего релиза на момент сборки.
const FALLBACK_RELEASE = {"tag": "v6.59", "apk": "https://github.com/semerr1334/BlitzRelease1120/releases/download/v6.59/WoT_Blitz_11.20.0_Server_v659.apk", "hotfix": "https://github.com/semerr1334/BlitzRelease1120/releases/download/v6.59/blitz_hotfix_659.zip"};

const TG = (token, method) => `https://api.telegram.org/bot${token}/${method}`;
const MSK_OFFSET = 3 * 3600 * 1000;

function envInt(env, name, def) {
  const v = parseInt(env[name] || "", 10);
  return Number.isFinite(v) ? v : def;
}

function idList(env, name) {
  return (env[name] || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s))
    .map((s) => parseInt(s, 10));
}

function norm(text) {
  return (text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function parseVersion(text) {
  const re = /(?<!\d)6[.,](\d{1,2})(?!\d)/g;
  let m, last = null;
  while ((m = re.exec(text || "")) !== null) last = m;
  return last ? [6, parseInt(last[1], 10)] : null;
}

function classify(text) {
  const t = norm(text);
  let best = null, bestScore = 0;
  for (const issue of KB.issues) {
    let score = 0;
    for (const s of issue.strong || []) if (s && t.includes(s)) score += 4;
    for (const k of issue.keywords || []) if (k && t.includes(k)) score += 1;
    if (score > bestScore) { best = issue; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

function chunk(text, n = 3800) {
  if (text.length <= n) return [text];
  const out = [];
  let rest = text;
  while (rest.length > n) {
    let cut = rest.lastIndexOf("\n", n);
    if (cut < n / 2) cut = n;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) out.push(rest);
  return out;
}

async function tgCall(env, method, params) {
  const r = await fetch(TG(env.TELEGRAM_BOT_TOKEN, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  return r.json();
}

function menuKeyboard() {
  return [
    [{ text: "🗺 Карта и коллизии", callback_data: "i:map-collisions" },
     { text: "🏅 Награды и знак", callback_data: "i:mark-mastery" }],
    [{ text: "💥 Вылеты и фризы", callback_data: "i:hangar-freeze" },
     { text: "📲 Установка и обновление", callback_data: "i:install" }],
    [{ text: "🆕 Что нового", callback_data: "b:new" },
     { text: "📋 Все темы", callback_data: "b:all" }],
  ];
}

function whatsNewText(rel) {
  if (!rel.tag) return "Не смог узнать версию — GitHub не ответил. Попробуй через минуту.";
  if (!rel.body) return `Актуальная версия: ${rel.tag}\n\nАПК (ставить сверху, игру не удалять):\n${rel.apk}`;
  // Markdown релиза -> читаемый текст: заголовки, звёздочки и ссылки убираем
  let body = rel.body
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (body.length > 3200) body = body.slice(0, 3190).trimEnd() + "…";
  return `🆕 ${rel.tag}\n\n${body}`;
}

async function send(env, chatId, text, replyTo, keyboard) {
  text = (text || "").trim();
  if (!text) return;
  const parts = chunk(text);
  for (let i = 0; i < parts.length; i++) {
    const p = {
      chat_id: chatId,
      text: parts[i],
      disable_web_page_preview: true,
    };
    if (replyTo && i === 0) {
      p.reply_to_message_id = replyTo;
      p.allow_sending_without_reply = true;
    }
    if (keyboard && i === 0) p.reply_markup = { inline_keyboard: keyboard };
    await tgCall(env, "sendMessage", p);
  }
}

// ------------------------------------------------------------- подписка ---

// Проверяем, подписан ли человек на канал. Работает только если бот — админ
// канала. Если проверка невозможна (бота не добавили, канал закрыт), НЕ
// блокируем: иначе из-за настройки весь чат останется без ссылок.
async function isSubscribed(env, userId) {
  const ch = env.CHANNEL;
  if (!ch) return true;
  try {
    const r = await tgCall(env, "getChatMember", { chat_id: ch, user_id: userId });
    if (!r || !r.ok) return true;
    const st = (r.result || {}).status;
    return st === "creator" || st === "administrator" || st === "member"
      || (st === "restricted" && !!r.result.is_member);
  } catch (e) {
    return true;
  }
}

function gateKeyboard(env) {
  const link = env.CHANNEL_LINK || (env.CHANNEL && String(env.CHANNEL).startsWith("@")
    ? "https://t.me/" + String(env.CHANNEL).replace(/^@/, "")
    : "");
  const rows = [];
  if (link) rows.push([{ text: "📢 Подписаться на канал", url: link }]);
  rows.push([{ text: "✅ Я подписался", callback_data: "sub:check" }]);
  return rows;
}

function gateText(env) {
  return "Ссылка на АПК — для подписчиков канала.\n\n"
    + "1) Нажми «Подписаться» и подпишись.\n"
    + "2) Вернись и нажми «Я подписался» — сразу пришлю ссылку.\n\n"
    + "Подписка бесплатная, отписаться можно когда угодно.";
}

// ---------------------------------------------------------------- релиз ---

async function latestRelease(env) {
  const cache = caches.default;
  const key = new Request("https://cache.local/release", { method: "GET" });
  try {
    const hit = await cache.match(key);
    if (hit) return await hit.json();
  } catch (e) {}
  const repo = env.GITHUB_REPO || "semerr1334/BlitzServer1120";
  const headers = { "user-agent": "BlitzBot/1.0" };
  if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN;
  let info = { tag: "", apk: "", hotfix: "", body: "" };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
    const d = await r.json();
    info.tag = d.tag_name || "";
    info.body = d.body || "";
    for (const a of d.assets || []) {
      const name = a.name || "";
      if (!info.apk && /\.apk$/i.test(name)) info.apk = a.browser_download_url;
      else if (!info.hotfix && /hotfix/i.test(name)) info.hotfix = a.browser_download_url;
    }
  } catch (e) {}
  if (!info.tag) {
    // GitHub не ответил (лимит 60 запросов/час без токена) — берём то, что собрали
    info = { ...FALLBACK_RELEASE };
  }
  if (info.tag) {
    const num = info.tag.replace(/^v/i, "").replace(/\./g, "");
    if (!info.apk) info.apk = `https://github.com/${repo}/releases/download/${info.tag}/WoT_Blitz_11.20.0_Server_v${num}.apk`;
    if (!info.hotfix) info.hotfix = `https://github.com/${repo}/releases/download/${info.tag}/blitz_hotfix_${num}.zip`;
  }
  if (info.tag) {
    // кэшируем только удачный ответ, иначе пустышка залипнет на 10 минут
    try {
      await cache.put(key, new Response(JSON.stringify(info), {
        headers: { "content-type": "application/json", "cache-control": "max-age=600" },
      }));
    } catch (e) {}
  }
  return info;
}

function render(issue, text, rel) {
  const version = parseVersion(text);
  const fixed = parseVersion(issue.fixed_in || "");
  let body = issue.answer || "";
  if (fixed && version && (version[0] > fixed[0] || (version[0] === fixed[0] && version[1] >= fixed[1])) && issue.answer_after_fix) {
    body = issue.answer_after_fix;
  }
  return body
    .replace(/\{apk\}/g, rel.apk || "")
    .replace(/\{hotfix\}/g, rel.hotfix || "")
    .trim();
}

function knownList() {
  // Группируем: так список читается, а не «простыня из 23 строк».
  const groups = [
    { st: "fixed", head: "✅ Исправлено" },
    { st: "open", head: "🔧 В работе" },
    { st: "deferred", head: "⏸ Отложено" },
    { st: "info", head: "ℹ️ Справка" },
  ];
  const lines = [];
  for (const g of groups) {
    const items = KB.issues.filter((i) => (i.status || "info") === g.st);
    if (!items.length) continue;
    lines.push(g.head + ":");
    for (const i of items) {
      const name = i.short || i.title;
      lines.push(g.st === "fixed" && i.fixed_in ? `• ${name} — с v${i.fixed_in}` : `• ${name}`);
    }
    lines.push("");
  }
  lines.push("Напиши, что не работает, обычными словами — подскажу, что делать.");
  return lines.join("\n");
}

// ------------------------------------------------------------------ логи ---

async function ghJson(env, url) {
  const headers = { "user-agent": "BlitzBot/1.0", accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("github " + r.status);
  return r.json();
}

async function recentLogs(env, limit) {
  const repo = env.GITHUB_REPO || "semerr1334/BlitzServer1120";
  const d = await ghJson(env, `https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);
  const out = [];
  for (const e of d.tree || []) {
    const p = e.path || "";
    if (!p.startsWith("logs/") || !p.endsWith(".txt")) continue;
    const m = p.match(/diag_(?:v?([0-9.]+)_)?(\d{13})\.txt$/);
    if (m) out.push({ epoch: parseInt(m[2], 10), path: p, sha: e.sha });
  }
  out.sort((a, b) => b.epoch - a.epoch);
  return out.slice(0, limit);
}

async function readLog(env, entry) {
  const repo = env.GITHUB_REPO || "semerr1334/BlitzServer1120";
  const headers = { "user-agent": "BlitzBot/1.0" };
  if (env.GITHUB_TOKEN) {
    headers.authorization = "Bearer " + env.GITHUB_TOKEN;
    headers.accept = "application/vnd.github.raw";
    const r = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${entry.sha}`, { headers });
    if (r.ok) return r.text();
  }
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/main/${entry.path}`, { headers });
    if (r.ok) return r.text();
  } catch (e) {}
  return "";
}

function scanLog(text) {
  const findings = [];
  let severe = false;
  for (const s of KB.log_signatures || []) {
    if (!s.match) continue;
    if (text.includes(s.match)) {
      if (!findings.includes(s.text)) findings.push(s.text);
      severe = severe || !!s.severe;
    }
  }
  const v = text.match(/mod: version=([0-9.]+)\s+apk=([0-9.]+)/);
  const map = text.match(/battle: map ([A-Za-z0-9_]+)/);
  return { findings, severe, version: v ? v[1] : "", map: map ? map[1] : "" };
}

function mskTime(epoch) {
  const d = new Date(epoch + MSK_OFFSET);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function logDevice(path) {
  const parts = path.split("/");
  return parts.length > 2 ? parts[1] : "?";
}

// --------------------------------------------------------------- команды ---

async function cmdLogs(env, arg) {
  let n = parseInt(arg || "3", 10);
  if (!Number.isFinite(n) || n < 1) n = 3;
  n = Math.min(n, 5);
  const logs = await recentLogs(env, 20);
  if (!logs.length) return "Логов пока нет (или GitHub не ответил).";
  const lines = [`Последние ${Math.min(n, logs.length)} лог(ов):`];
  for (const entry of logs.slice(0, n)) {
    const text = await readLog(env, entry);
    const info = scanLog(text);
    const ver = info.version || (entry.path.match(/diag_v?([0-9.]+)_/) || [])[1] || "?";
    lines.push("");
    lines.push(`• ${logDevice(entry.path)} · v${ver} · ${mskTime(entry.epoch)}`);
    lines.push(info.findings.length
      ? `   ${info.severe ? "⚠" : "•"} ${info.findings.join("; ")}`
      : "   ✅ проблем в логе не видно");
  }
  return lines.join("\n");
}

async function cmdDigest(env) {
  const logs = await recentLogs(env, 40);
  const dayAgo = Date.now() - 86400 * 1000;
  const fresh = logs.filter((x) => x.epoch >= dayAgo);
  if (!fresh.length) return "За сутки новых логов нет.";
  const devices = new Set();
  const bad = [];
  for (const entry of fresh.slice(0, 6)) {
    devices.add(logDevice(entry.path));
    const info = scanLog(await readLog(env, entry));
    if (info.severe) bad.push(`${logDevice(entry.path)} · v${info.version || "?"} — ${info.findings.join("; ")}`);
  }
  return [
    "📊 Сводка за сутки",
    `Новых логов: ${fresh.length}, устройств: ${devices.size}`,
    `С проблемами: ${bad.length}`,
    ...bad.slice(0, 8).map((b) => "• " + b),
  ].join("\n");
}

function helpText() {
  return ("Я помощник по моду. Что умею:\n\n"
    + "/version — последнее обновление и ссылки\n"
    + "/issues — что уже починил, что в работе\n"
    + "/id — показать id этого чата\n"
    + "/whatsnew — что нового в последней версии\n\n"
    + "Или выбери кнопку ниже — так быстрее всего.\n\n"
    + "Или просто напиши, что не работает: «улетаю за карту», «нет знака», "
    + "«вылетает», «как обновить» — подскажу, что делать.");
}

// --------------------------------------------------------------- обработка ---

async function handleMessage(env, msg) {
  const chat = msg.chat || {};
  const user = msg.from || {};
  const chatId = chat.id;
  const userId = user.id || 0;
  let text = (msg.text || msg.caption || "").trim();
  const hasMedia = !!(msg.photo || msg.document || msg.video);
  if (!chatId || user.is_bot) return null;
  if (hasMedia) {
    // Скриншот — самое ценное, что может прислать человек. Пересылаем админам.
    const admins = idList(env, "ADMIN_IDS");
    for (const a of admins) {
      try {
        await tgCall(env, "forwardMessage", { chat_id: a, from_chat_id: chatId, message_id: msg.message_id });
      } catch (e) {}
    }
    if (admins.length) {
      const who = user.username ? "@" + user.username : (user.first_name || "кто-то");
      for (const a of admins) {
        try {
          await send(env, a, `📎 Вложение от ${who} (чат ${chatId})` + (text ? `\nПодпись: ${text}` : ""));
        } catch (e) {}
      }
    }
    return {
      text: admins.length
        ? "Скриншот получил, передал разработчику ✅\n\nНапиши в двух словах: что случилось и на какой карте (если в бою) — так найдём быстрее."
        : "Скриншот вижу, но пересылать пока некому. Опиши проблему словами: что делал и что случилось.",
      replyTo: msg.message_id,
    };
  }
  if (!text) return null;

  const allowed = idList(env, "ALLOWED_CHAT_IDS");
  if (allowed.length && !allowed.includes(chatId)) return { skip: "чужой чат" };

  const admins = idList(env, "ADMIN_IDS");
  const isAdmin = admins.length === 0 || admins.includes(userId);

  const m = text.match(/^\/([A-Za-z_]+)(?:@\w+)?\s*([\s\S]*)$/);
  if (m) {
    const cmd = m[1].toLowerCase();
    const arg = (m[2] || "").trim();
    if (["start", "help", "menu"].includes(cmd)) {
      return { text: helpText(), replyTo: msg.message_id, keyboard: menuKeyboard() };
    }
    if (["whatsnew", "new", "changelog"].includes(cmd)) {
      return { text: whatsNewText(await latestRelease(env)), replyTo: msg.message_id };
    }
    if (["version", "ver", "update", "apk"].includes(cmd)) {
      const rel = await latestRelease(env);
      if (!rel.tag) return { text: "Не смог узнать версию — GitHub не ответил. Попробуй через минуту." };
      if (env.REQUIRE_SUB && env.CHANNEL && !(await isSubscribed(env, userId))) {
        return { text: gateText(env), replyTo: msg.message_id, keyboard: gateKeyboard(env) };
      }
      return {
        replyTo: msg.message_id,
        text: `Последняя версия: ${rel.tag}\n\nАПК (ставить сверху, игру не удалять):\n${rel.apk}`,
      };
    }
    if (["issues", "problems", "known"].includes(cmd)) return { text: knownList(), replyTo: msg.message_id };
    if (cmd === "id") {
      return { text: `chat_id: ${chatId}\nтвой user_id: ${userId}`, replyTo: msg.message_id };
    }
    if (cmd === "logs") {
      if (!isAdmin) return { text: "Это команда для разработчика." };
      if (!env.GITHUB_TOKEN) {
        return { text: "Логи не подключены: в настройках Worker нет GITHUB_TOKEN.\n\n"
          + "Репозиторий с логами приватный, без токена бот их не видит.\n"
          + "GitHub → Settings → Developer settings → Fine-grained tokens → "
          + "права Contents: Read-only на репозиторий с логами → добавить сюда как Secret GITHUB_TOKEN." };
      }
      try {
        return { text: await cmdLogs(env, arg) };
      } catch (e) {
        return { text: "Не смог прочитать логи (" + String(e.message || e) + ").\n"
          + "Проверь, что GITHUB_TOKEN не истёк и у него есть право Contents: Read." };
      }
    }
    if (cmd === "digest") {
      if (!isAdmin) return { text: "Это команда для разработчика." };
      if (!env.GITHUB_TOKEN) return { text: "Логи не подключены: нужен GITHUB_TOKEN в настройках Worker." };
      try {
        return { text: await cmdDigest(env) };
      } catch (e) {
        return { text: "Не смог прочитать логи (" + String(e.message || e) + ")." };
      }
    }
    if (cmd === "check") text = arg || text;
    else return { text: "Не знаю такую команду. /help — что умею." };
  }

  const issue = classify(text);
  if (!issue) {
    return {
      text: "Пока не понял, что не работает.\n\nНапиши по-простому:\n1) что делал;\n2) что случилось;\n3) карта или танк (если в бою).\n\nИли посмотри /issues — там список известного.",
      replyTo: msg.message_id,
      escalate: { text, ask: "уточнить детали: что делал и что случилось", chat, user },
    };
  }

  const rel = await latestRelease(env);
  let answer = render(issue, text, rel);

  // Если в ответе есть ссылка на АПК и включён режим подписки — проверяем.
  if (env.REQUIRE_SUB && env.CHANNEL && answer.includes(rel.apk || "\u0000")) {
    const sub = await isSubscribed(env, userId);
    if (!sub) {
      return { text: gateText(env), replyTo: msg.message_id, keyboard: gateKeyboard(env) };
    }
  }
  const version = parseVersion(text);
  const fixed = parseVersion(issue.fixed_in || "");
  const regression = !!(fixed && version && (version[0] > fixed[0] || (version[0] === fixed[0] && version[1] >= fixed[1])));
  const esc = regression || issue.status === "open" || !!issue.severe
    ? { text, ask: issue.ask || "", chat, user }
    : null;
  return { text: answer, replyTo: msg.message_id, escalate: esc };
}

async function escalate(env, ev) {
  const admins = idList(env, "ADMIN_IDS");
  if (!admins.length || !ev) return;
  const who = ev.user.username ? "@" + ev.user.username
    : ((ev.user.first_name || "") + " " + (ev.user.last_name || "")).trim();
  const body = `❗ Вопрос без готового ответа\n\n`
    + `Чат: ${ev.chat.title || "?"} (${ev.chat.id})\n`
    + `Кто: ${who || "?"} (id ${ev.user.id})\n`
    + `Текст: ${(ev.text || "").slice(0, 500)}\n\n`
    + `Что просить: ${ev.ask || "уточнить детали: что делал и что случилось"}`;
  for (const a of admins) {
    await send(env, a, body);
  }
}

async function handleCallback(env, cq) {
  const data = cq.data || "";
  const chatId = ((cq.message || {}).chat || {}).id;
  try {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cq.id });
  } catch (e) {}
  if (!chatId) return;
  try {
    if (data.startsWith("i:")) {
      const id = data.slice(2);
      const issue = KB.issues.find((i) => i.id === id);
      if (issue) await send(env, chatId, render(issue, "", await latestRelease(env)));
      else await send(env, chatId, "Такой темы нет. Напиши, что случилось, обычными словами.");
    } else if (data === "sub:check") {
      const userId = ((cq.from || {}).id) || 0;
      if (await isSubscribed(env, userId)) {
        const rel = await latestRelease(env);
        await send(env, chatId, `Готово ✅\n\nПоследняя версия: ${rel.tag}\n\nАПК (ставить сверху, игру не удалять):\n${rel.apk}`);
      } else {
        await send(env, chatId, "Пока не вижу подписки.\n\nПодпишись на канал и нажми «Я подписался» ещё раз.",
          null, gateKeyboard(env));
      }
    } else if (data === "b:new") {
      await send(env, chatId, whatsNewText(await latestRelease(env)));
    } else if (data === "b:all") {
      await send(env, chatId, knownList());
    }
  } catch (e) {
    try { await send(env, chatId, "Не смог открыть этот раздел. Напиши вопрос текстом."); } catch (e2) {}
  }
}

// ------------------------------------------------------------------ worker ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.WEBHOOK_SECRET || "";

    if (request.method === "GET") {
      if (url.searchParams.get("set") === "1") {
        if (!secret) return new Response("Сначала задай WEBHOOK_SECRET в настройках Worker.", { status: 400 });
        const target = `${url.origin}${url.pathname}`;
        const r = await tgCall(env, "setWebhook", {
          url: target,
          secret_token: secret,
          allowed_updates: ["message", "edited_message"],
        });
        return new Response(JSON.stringify(r, null, 1), { headers: { "content-type": "application/json" } });
      }
      if (url.searchParams.get("info") === "1") {
        const rel = await latestRelease(env);
        return new Response(
          `BlitzBot worker\nrelease: ${rel.tag || "?"}\nissues: ${KB.issues.length}\n` +
          `webhook secret: ${secret ? "set" : "НЕ ЗАДАН"}\n` +
          `chat filter: ${idList(env, "ALLOWED_CHAT_IDS").join(",") || "любой"}\n` +
          `admins: ${idList(env, "ADMIN_IDS").join(",") || "не заданы"}\n` +
          `channel: ${env.CHANNEL || "не задан"}\n` +
          `require sub: ${env.REQUIRE_SUB ? "да" : "нет"}\n`,
          { headers: { "content-type": "text/plain; charset=utf-8" } },
        );
      }
      return new Response("BlitzBot. Открой ?set=1 чтобы включить webhook, ?info=1 чтобы проверить.", { status: 200 });
    }

    if (request.method !== "POST") return new Response("ok");
    if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      return new Response("forbidden", { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response("bad json", { status: 400 });
    }
    if (update.callback_query) {
      await handleCallback(env, update.callback_query);
      return new Response("ok");
    }

    const msg = update.message || update.edited_message;
    if (!msg) return new Response("ok");

    let result = null;
    try {
      result = await handleMessage(env, msg);
    } catch (e) {
      // Молчать нельзя: человек решит, что бот сломан. Говорим честно и внятно.
      try {
        await send(env, msg.chat.id, "У меня что-то сломалось на этом сообщении. "
          + "Попробуй ещё раз или напиши /version — там ссылки на актуальную версию.\n\n"
          + "Ошибка: " + String(e.message || e).slice(0, 200));
      } catch (e2) {}
      return new Response("ok");
    }
    if (result && result.text) {
      await send(env, msg.chat.id, result.text, result.replyTo, result.keyboard);
    }
    if (result && result.escalate) {
      try {
        await escalate(env, result.escalate);
      } catch (e) {}
    }
    return new Response("ok");
  },
};
