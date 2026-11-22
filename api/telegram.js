import { PRODUCTS, route, safeEq, send, readBody, HB_TTL } from "./_lib.js";
import { checkWeb, heartbeatState } from "./_monitor.js";
import { range, get, set, del, log, persistent } from "./_store.js";
import { tg, esc, hhmm, fmtDur } from "./_telegram.js";
import { getT, LANGS } from "./_i18n.js";

const LV = { INFO: "ℹ️", WARN: "⚠️", ERROR: "❌", FATAL: "🚨" };
const LEVELS = Object.keys(LV);
const DOT = { online: "🟢", offline: "🔴", not_connected: "⚪", unknown: "⚪" };
const G = { online: "●", offline: "✕", not_connected: "○", unknown: "○" };
const SP = "▁▂▃▄▅▆▇█";
const btn = (text, data) => ({ text, callback_data: data });
const spark = (h = []) => { const a = h.slice(-8), m = Math.max(1, ...a); return a.map((x) => (x > 0 ? SP[Math.min(7, Math.floor((x / m) * 7.99))] : "·")).join("").padStart(8); };
const age = (L, ms) => `${fmtDur(L, ms)} ${L.ago}`;
const brief = (ms) => (ms < 60e3 ? `${Math.round(ms / 1000)}s` : ms < 3.6e6 ? `${Math.round(ms / 6e4)}m` : `${Math.round(ms / 3.6e6)}h`);
const label = (L, s) => ({ online: L.online, offline: L.offline, not_connected: L.nc, unknown: L.nc })[s];
const stats = async () => JSON.parse((await get("stats")) || "{}");
const board = (rows) => `<pre>${esc(rows.map((r) => `${G[r.s]} ${r.p.short.padEnd(13)}${r.val.padStart(7)} ${spark(r.h)}`).join("\n"))}</pre>`;
const head = (title) => `<b>${title}</b> · <code>${hhmm(Date.now())} WIB</code>`;
const pad = (k, v) => `${k.padEnd(10)}${v}`;
const pre = (lines) => `<pre>${esc(lines.join("\n"))}</pre>`;
const nav = (L, ...extra) => [[...extra, btn(L.menu, "menu")]];
const greetIdx = (h) => (h >= 5 && h < 11 ? 1 : h >= 11 && h < 15 ? 2 : h >= 15 && h < 18 ? 3 : 0);
const wibHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false })) % 24;

async function probe(L, p, st) {
  if (p.kind === "web") {
    const o = await checkWeb(p);
    return { p, o, s: o.status, val: o.status === "online" ? `${o.ms}ms` : "down", h: [...(st[p.id]?.h || []), o.status === "online" ? Math.max(1, o.ms) : 0] };
  }
  const h = await heartbeatState(p);
  return { p, hb: h, s: h.state, val: h.ageMs == null ? "—" : brief(h.ageMs), h: [] };
}

async function render(action, args, L, c) {
  const webs = PRODUCTS.filter((p) => p.kind === "web");
  if (action === "help") return { text: `${head(L.help)}\n\n${pre(L.helpList.flatMap(([k, d]) => [k, "  " + d]))}`, kb: nav(L) };
  if (action === "lang") return { text: `<b>${L.chooseLang}</b>`, kb: [[btn("Indonesia", "setlang:id"), btn("English", "setlang:en")], ...nav(L)] };

  if (action === "status") {
    const st = await stats();
    const rows = await Promise.all(PRODUCTS.map((p) => probe(L, p, st)));
    const n = (s) => rows.filter((r) => r.s === s).length;
    const banner = n("offline") === 0 ? L.allOk : n("online") === 0 ? L.major : L.partial;
    const kb = [];
    for (let i = 0; i < PRODUCTS.length; i += 3) kb.push(PRODUCTS.slice(i, i + 3).map((p) => btn(p.short, "chk:" + p.id)));
    kb.push([btn(`↻ ${L.refresh}`, "status"), btn(L.menu, "menu")]);
    return { text: `${head(L.status)}\n<i>${banner}</i>\n\n${board(rows)}${DOT.online} ${n("online")}   ${DOT.offline} ${n("offline")}   ${DOT.not_connected} ${n("not_connected")}`, kb };
  }

  if (action === "chk") {
    const p = PRODUCTS.find((x) => x.id === args[0]);
    if (!p) return { text: L.notfound, kb: nav(L) };
    const st = await stats();
    const r = await probe(L, p, st);
    const s = st[p.id];
    const lines = p.kind === "web"
      ? [pad("Status", label(L, r.s)), pad("HTTP", String(r.o.code ?? "—")), pad(L.resp, `${r.o.ms} ms`), pad(L.uptime, s?.n ? `${((s.ok / s.n) * 100).toFixed(2)}% (${s.n})` : "—"), pad(L.trend, spark(r.h).trim() || "—"), ...(r.o.error ? [pad(L.reason, r.o.error)] : [])]
      : [pad("Status", label(L, r.s)), pad(L.hb, r.hb.ageMs == null ? "—" : age(L, r.hb.ageMs)), pad(L.ver, r.hb.version || "—")];
    return {
      text: `${DOT[r.s]} <b>${esc(p.name)}</b> · <i>${p.kind === "web" ? L.typeWeb : L.typeDesk}</i>\n${pre(lines)}${p.url ? `<a href="${p.url}">${esc(new URL(p.url).hostname)}</a>\n` : ""}<code>${hhmm(Date.now())} WIB</code>`,
      kb: [[btn(`↻ ${L.recheck}`, "chk:" + p.id)], [btn(`‹ ${L.back}`, "status"), btn(L.menu, "menu")]],
    };
  }

  if (action === "up") {
    const st = await stats();
    const rows = webs.map((p) => { const s = st[p.id]; return s?.n ? `${p.short.padEnd(14)}${(((s.ok / s.n) * 100).toFixed(2) + "%").padStart(8)}${(s.ok ? Math.round(s.ms / s.ok) + "ms" : "—").padStart(8)}` : `${p.short.padEnd(14)}${"—".padStart(8)}${"—".padStart(8)}`; });
    const since = webs.map((p) => st[p.id]?.since).filter(Boolean).sort()[0];
    const foot = since ? `<i>${L.based} ${new Date(since).toLocaleDateString(c.loc, { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" })}</i>` : `<i>${L.noData}</i>`;
    return { text: `${head(L.uptime)}\n\n${pre([`${L.product.padEnd(14)}${"Uptime".padStart(8)}${"Avg".padStart(8)}`, ...rows])}${foot}`, kb: nav(L, btn(`↻ ${L.refresh}`, "up")) };
  }

  if (action === "inc") {
    const hist = (await range("incidents", 10)).map((x) => JSON.parse(x));
    const live = [];
    for (const p of PRODUCTS) {
      const down = p.kind === "web" ? (Number(await get("fail:" + p.id)) || 0) >= 3 : (await get("hbs:" + p.id)) === "offline";
      if (down) { const since = Number(await get("down:" + p.id)) || 0; live.push(`✕ ${p.short.padEnd(11)}${since ? `${hhmm(since)} · ${fmtDur(L, Date.now() - since)}` : "—"}`); }
    }
    const done = hist.map((i) => `✓ ${(i.short || i.name).slice(0, 11).padEnd(11)}${hhmm(i.start)}→${hhmm(i.end)} ${fmtDur(L, i.end - i.start)}`);
    const mttr = hist.length ? `<i>${L.mttr}: ${fmtDur(L, hist.reduce((a, i) => a + (i.end - i.start), 0) / hist.length)}</i>` : "";
    const body = live.length || done.length ? `${live.length ? `<b>${L.ongoing}</b>\n${pre(live)}` : ""}${done.length ? `<b>${L.history}</b>\n${pre(done)}` : ""}${mttr}` : `<i>${L.noInc}</i>`;
    return { text: `${head(L.incidents)}\n\n${body}`, kb: nav(L, btn(`↻ ${L.refresh}`, "inc")) };
  }

  if (action === "desk") {
    const ds = PRODUCTS.filter((p) => p.kind === "desktop");
    if (!ds.length) return { text: `${head(L.desktop)}\n<i>${L.noDesk}</i>`, kb: nav(L) };
    const st = await stats();
    const rows = await Promise.all(ds.map((p) => probe(L, p, st)));
    const body = rows.map((r) => `${DOT[r.s]} <b>${esc(r.p.name)}</b>\n${pre([pad("Status", label(L, r.s)), pad(L.hb, r.hb.ageMs == null ? "—" : age(L, r.hb.ageMs)), pad(L.ver, r.hb.version || "—")])}`).join("");
    return { text: `${head(L.desktop)}\n\n${body}<i>${L.hbHow}</i>\n<code>POST https://${c.host}/api/heartbeat</code>`, kb: nav(L, btn(`↻ ${L.refresh}`, "desk")) };
  }

  if (action === "links") {
    const kb = [];
    for (let i = 0; i < webs.length; i += 2) kb.push(webs.slice(i, i + 2).map((p) => ({ text: `${p.short} ↗`, url: p.url })));
    kb.push([{ text: `${L.dashboard} ↗`, url: c.url }, btn(L.menu, "menu")]);
    return { text: `${head(L.links)}\n\n${webs.map((p) => `• <a href="${p.url}">${esc(p.name)}</a>`).join("\n")}`, kb };
  }

  if (action === "notif") {
    const until = Number(await get("mute")) || 0;
    const state = until > Date.now() ? `🔕 ${L.muted} <b>${hhmm(until)} WIB</b>` : `🔔 <b>${L.notifOn}</b>`;
    return { text: `${head(L.notif)}\n\n${state}\n<i>${L.note}</i>`, kb: [[btn(`${L.mute} 1${L.u[2][0]}`, "mute:1"), btn(`${L.mute} 8${L.u[2][0]}`, "mute:8"), btn(`${L.mute} 24${L.u[2][0]}`, "mute:24")], [btn(L.unmute, "mute:0")], ...nav(L)] };
  }

  if (action === "sys") {
    const st = await stats();
    const until = Number(await get("mute")) || 0;
    const ca = st._cron ? Date.now() - st._cron : null;
    const lines = [
      pad(L.storage, persistent() ? L.storPerm : L.storMem),
      pad(L.cron, ca == null ? L.never : age(L, ca) + (ca > 15 * 60_000 ? ` (${L.late})` : "")),
      pad(L.token, process.env.HEARTBEAT_TOKEN ? L.set : L.unset),
      pad(L.alerts, until > Date.now() ? `${L.muted} ${hhmm(until)}` : L.notifOn),
      pad(L.lang, c.lang.toUpperCase()),
      pad("HB TTL", `${HB_TTL / 1000}s`),
    ];
    return { text: `${head(L.system)}\n\n${pre(lines)}`, kb: nav(L, btn(`↻ ${L.refresh}`, "sys")) };
  }

  if (action === "clr") {
    if (args[0] === "yes") { await del("logs"); await log("INFO", "system", "Log dibersihkan lewat Telegram"); return render("logs", ["ALL"], L, c); }
    return { text: `<b>${L.clear}</b>\n${L.clrAsk}`, kb: [[btn(L.yes, "clr:yes"), btn(L.cancel, "logs:ALL")]] };
  }

  if (action === "logs") {
    const lv = LEVELS.includes(args[0]) ? args[0] : "ALL";
    const rows = (await range("logs", 200)).map((x) => JSON.parse(x)).filter((l) => lv === "ALL" || l.level === lv).slice(0, 8);
    const body = rows.length ? rows.map((l) => `${LV[l.level]} <code>${hhmm(l.t)}</code> ${esc(l.source)}\n      ${esc(l.message)}`).join("\n") : `<i>${L.empty}</i>`;
    const f = (k, t) => btn(`${lv === k ? "· " : ""}${t}`, "logs:" + k);
    return { text: `${head(L.logs + (lv === "ALL" ? "" : ` ${lv}`))}\n\n${body}`, kb: [[f("ALL", L.all), f("INFO", "ℹ️"), f("WARN", "⚠️"), f("ERROR", "❌"), f("FATAL", "🚨")], [btn(`↻ ${L.refresh}`, "logs:" + lv), btn(L.clear, "clr"), btn(L.menu, "menu")]] };
  }

  // menu utama: papan status dari data cron terakhir (instan, tanpa menunggu pemeriksaan)
  const st = await stats();
  const rows = await Promise.all(PRODUCTS.map(async (p) => {
    if (p.kind === "desktop") { const h = await heartbeatState(p); return { p, s: h.state, val: h.ageMs == null ? "—" : brief(h.ageMs), h: [] }; }
    const hs = st[p.id]?.h || [], last = hs[hs.length - 1];
    return { p, s: last == null ? "unknown" : last > 0 ? "online" : "offline", val: last == null ? "—" : last > 0 ? `${last}ms` : "down", h: hs };
  }));
  return {
    text: `${L.greet[greetIdx(wibHour())]}, <b>${esc(c.name)}</b>\n<b>Aeryth Monitor</b>\n\n${board(rows)}<i>${st._cron ? `${L.cached} · ${age(L, Date.now() - st._cron)}` : L.waiting}</i>`,
    kb: [
      [btn(L.status, "status"), btn(L.uptime, "up")],
      [btn(L.incidents, "inc"), btn(L.logs, "logs:ALL")],
      [btn(L.desktop, "desk"), btn(L.links, "links")],
      [btn(L.notif, "notif"), btn(L.system, "sys")],
      [btn(L.lang, "lang"), btn(L.help, "help")],
      [{ text: `${L.dashboard} ↗`, url: c.url }],
    ],
  };
}

const CMDS = { "/start": "menu", "/menu": "menu", "/web": "links", "/help": "help", "/status": "status", "/lang": "lang", "/logs": "logs", "/check": "chk", "/uptime": "up", "/incidents": "inc", "/insiden": "inc", "/desktop": "desk", "/links": "links", "/notif": "notif", "/system": "sys" };

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
    action = CMDS[raw.split("@")[0].toLowerCase()] || "unknown";
    if (action === "logs") args = [(rest[0] || "").toUpperCase()];
    if (action === "chk") {
      const q = rest.join(" ").toLowerCase();
      args = [(q && PRODUCTS.find((x) => x.id === q || x.name.toLowerCase().includes(q)))?.id || ""];
    }
  }

  let lang = (await get("lang")) || "id";
  let toast;
  if (action === "setlang" && LANGS.includes(args[0])) { lang = args[0]; await set("lang", lang); action = "menu"; toast = getT(lang).langSet; }
  if (action === "mute") {
    const h = Number(args[0]) || 0;
    await set("mute", h ? Date.now() + h * 3_600_000 : 0);
    toast = h ? getT(lang).muteSet : getT(lang).unmuteSet;
    action = "notif";
  }
  const L = getT(lang);
  if (cb) await tg("answerCallbackQuery", { callback_query_id: cb.id, ...(toast ? { text: toast } : {}) });

  const ctx = { url: `https://${req.headers.host}`, host: req.headers.host, name: (cb || u.message).from?.first_name || "Admin", lang, loc: lang === "en" ? "en-GB" : "id-ID" };
  const view = action === "unknown" ? { text: L.unknown, kb: nav(L) } : await render(action, args, L, ctx);
  const payload = { chat_id: owner, text: view.text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: view.kb } };
  if (cb) await tg("editMessageText", { ...payload, message_id: msg.message_id });
  else await tg("sendMessage", payload);
  send(res, 200, { ok: true });
});
