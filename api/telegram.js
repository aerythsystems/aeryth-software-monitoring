import { PRODUCTS, route, safeEq, send, readBody } from "./_lib.js";
import { checkWeb, heartbeatState } from "./_monitor.js";
import { range, get, set } from "./_store.js";
import { tg, esc, hhmm } from "./_telegram.js";
import { getT, LANGS } from "./_i18n.js";

const ICON = { online: "🟢", offline: "🔴", not_connected: "⚪" };
const LV = { INFO: "ℹ️", WARN: "⚠️", ERROR: "❌", FATAL: "🚨" };
const LEVELS = Object.keys(LV);
const LINE = "━━━━━━━━━━━━━━━";
const btn = (text, data) => ({ text, callback_data: data });
const stateLabel = (L, s) => ({ online: L.online, offline: L.offline, not_connected: L.nc })[s];
const age = (L, ms) => (ms < 60_000 ? `${Math.round(ms / 1000)} ${L.agoS}` : `${Math.round(ms / 60_000)} ${L.agoM}`);
const bar = (n, total) => { const f = total ? Math.round((n / total) * 10) : 0; return "▰".repeat(f) + "▱".repeat(10 - f); };
const now = () => `🕒 <code>${hhmm(Date.now())} WIB</code>`;
const menuKb = (L, url) => [[btn(`📊 ${L.bStatus}`, "status"), btn(`📜 ${L.bLogs}`, "logs:ALL")], [{ text: `🌐 ${L.bWeb}`, url }, btn(`🌍 ${L.bLang}`, "lang")]];
const homeRow = (L) => [btn(`🏠 ${L.bMenu}`, "menu")];

async function probe(L, p) {
  if (p.kind === "web") {
    const o = await checkWeb(p);
    return { p, s: o.status, sub: o.status === "online" ? `${o.ms} ms` : o.error || `HTTP ${o.code}`, o };
  }
  const h = await heartbeatState(p);
  return { p, s: h.state, sub: h.ageMs == null ? L.nohb : `${L.hb} ${age(L, h.ageMs)}`, h };
}

async function render(action, args, L, url) {
  if (action === "help") {
    return { text: `❓ <b>${L.helpTitle}</b>\n${LINE}\n${L.help.map(([c, d]) => `<code>${esc(c)}</code>\n   ${d}`).join("\n")}`, kb: [homeRow(L)] };
  }
  if (action === "lang") {
    return { text: `🌍 <b>${L.chooseLang}</b>`, kb: [[btn("🇮🇩 Indonesia", "setlang:id"), btn("🇬🇧 English", "setlang:en")]] };
  }
  if (action === "status") {
    const rows = await Promise.all(PRODUCTS.map((p) => probe(L, p)));
    const c = (s) => rows.filter((r) => r.s === s).length;
    const list = rows.map((r) => `${ICON[r.s]} <b>${esc(r.p.name)}</b>\n      <code>${stateLabel(L, r.s)} · ${esc(r.sub)}</code>`).join("\n");
    const kb = [];
    for (let i = 0; i < PRODUCTS.length; i += 2) kb.push(PRODUCTS.slice(i, i + 2).map((p) => btn(`🔍 ${p.name}`, "chk:" + p.id)));
    kb.push([btn(`🔄 ${L.bRefresh}`, "status"), btn(`🏠 ${L.bMenu}`, "menu")]);
    return { text: `📡 <b>${L.status}</b>\n${LINE}\n<code>${bar(c("online"), rows.length)}</code> <b>${c("online")}/${rows.length}</b> ${L.online}\n🟢 ${c("online")}   🔴 ${c("offline")}   ⚪ ${c("not_connected")}\n${LINE}\n${list}\n${LINE}\n${now()}`, kb };
  }
  if (action === "chk") {
    const p = PRODUCTS.find((x) => x.id === args[0]);
    if (!p) return { text: `⚠️ ${L.notfound}`, kb: [homeRow(L)] };
    const r = await probe(L, p);
    const pad = (k, v) => `${k.padEnd(10)}${esc(v)}`;
    const info = p.kind === "web"
      ? [pad("Status", stateLabel(L, r.s)), pad("HTTP", String(r.o.code ?? "—")), pad(L.resp, `${r.o.ms} ms`), ...(r.o.error ? [pad(L.reason, r.o.error)] : [])]
      : [pad("Status", stateLabel(L, r.s)), pad(L.hb, r.h.ageMs == null ? "—" : age(L, r.h.ageMs)), pad(L.ver, r.h.version || "—")];
    const link = p.url ? `\n🔗 <a href="${p.url}">${esc(new URL(p.url).hostname)}</a>` : "";
    return {
      text: `${ICON[r.s]} <b>${esc(p.name)}</b>\n<i>${p.kind === "web" ? L.typeWeb : L.typeDesk}</i>\n${LINE}\n<pre>${info.join("\n")}</pre>${link}\n\n${now()}`,
      kb: [[btn(`🔄 ${L.bRecheck}`, "chk:" + p.id)], [btn(`⬅️ ${L.bBack}`, "status"), btn(`🏠 ${L.bMenu}`, "menu")]],
    };
  }
  if (action === "logs") {
    const lv = LEVELS.includes(args[0]) ? args[0] : "ALL";
    const rows = (await range("logs", 200)).map((x) => JSON.parse(x)).filter((l) => lv === "ALL" || l.level === lv).slice(0, 8);
    const body = rows.length ? rows.map((l) => `${LV[l.level]} <code>${hhmm(l.t)}</code> <b>${l.level}</b> · ${esc(l.source)}\n└ ${esc(l.message)}`).join("\n\n") : `<i>${L.empty}</i>`;
    const f = (k, label) => btn(`${lv === k ? "• " : ""}${label}`, "logs:" + k);
    return {
      text: `📜 <b>${L.logs}</b>${lv === "ALL" ? "" : ` · ${lv}`}\n${LINE}\n${body}\n${LINE}\n${now()}`,
      kb: [[f("ALL", L.all), f("INFO", "ℹ️"), f("WARN", "⚠️"), f("ERROR", "❌"), f("FATAL", "🚨")], [btn(`🔄 ${L.bRefresh}`, "logs:" + lv), btn(`🏠 ${L.bMenu}`, "menu")]],
    };
  }
  return { text: `👋 <b>Aeryth Monitor</b>\n<i>${L.tag}</i>\n${LINE}\n${L.pick}`, kb: menuKb(L, url) };
}

export default route(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const sec = process.env.TELEGRAM_WEBHOOK_SECRET, owner = process.env.TELEGRAM_CHAT_ID;
  if (!sec || !owner || !process.env.TELEGRAM_BOT_TOKEN || !process.env.SESSION_SECRET) return send(res, 503, { error: "Telegram belum dikonfigurasi" });
  if (!safeEq(String(req.headers["x-telegram-bot-api-secret-token"] || ""), sec)) return send(res, 401, { error: "Unauthorized" });
  const u = await readBody(req);
  const cb = u?.callback_query;
  const msg = cb?.message || u?.message;
  // Hanya pemilik (chat ID terdaftar) yang dilayani.
  if (!msg || String(msg.chat?.id) !== String(owner)) return send(res, 200, { ok: true });

  let action, args = [];
  if (cb) {
    [action, ...args] = String(cb.data || "").split(":");
  } else {
    const text = typeof msg.text === "string" ? msg.text.trim() : "";
    if (!text.startsWith("/")) return send(res, 200, { ok: true });
    const [raw, ...rest] = text.split(/\s+/);
    const cmd = raw.split("@")[0].toLowerCase();
    action = { "/start": "menu", "/menu": "menu", "/web": "menu", "/help": "help", "/status": "status", "/lang": "lang", "/logs": "logs", "/check": "chk" }[cmd] || "unknown";
    if (action === "logs") args = [(rest[0] || "").toUpperCase()];
    if (action === "chk") {
      const q = rest.join(" ").toLowerCase();
      args = [(q && PRODUCTS.find((x) => x.id === q || x.name.toLowerCase().includes(q)))?.id || ""];
    }
  }

  let lang = (await get("lang")) || "id";
  let toast;
  if (action === "setlang" && LANGS.includes(args[0])) { lang = args[0]; await set("lang", lang); action = "menu"; toast = getT(lang).langSet; }
  const L = getT(lang);
  if (cb) await tg("answerCallbackQuery", { callback_query_id: cb.id, ...(toast ? { text: toast } : {}) });

  const view = action === "unknown" ? { text: `⚠️ ${L.unknown}`, kb: [homeRow(L)] } : await render(action, args, L, `https://${req.headers.host}`);
  const payload = { chat_id: owner, text: view.text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: view.kb } };
  if (cb) await tg("editMessageText", { ...payload, message_id: msg.message_id });
  else await tg("sendMessage", payload);
  send(res, 200, { ok: true });
});
