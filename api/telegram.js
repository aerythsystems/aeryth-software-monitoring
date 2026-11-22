import { PRODUCTS, route, safeEq, send, readBody, HB_TTL } from "./_lib.js";
import { checkWeb, heartbeatState, loadNodes } from "./_monitor.js";
import { range, get, set, del, log, persistent } from "./_store.js";
import { tg, esc, hhmm, fmtDur, lamp, gauge } from "./_telegram.js";
import { getT, LANGS } from "./_i18n.js";

const LV = { INFO: "ℹ️", WARN: "⚠️", ERROR: "❌", FATAL: "🚨" };
const LEVELS = Object.keys(LV);
const LINE = "━━━━━━━━━━━━━━━";
const SP = "▁▂▃▄▅▆▇█";
const btn = (text, data) => ({ text, callback_data: data });
const dot = (s, ms) => (s === "online" ? (ms > 1500 ? "🟡" : "🟢") : s === "offline" ? "🔴" : "⚪");
const label = (L, s, ms) => (s === "online" ? (ms > 1500 ? L.slow : L.online) : s === "offline" ? L.offline : L.nc);
const age = (L, ms) => `${fmtDur(L, ms)} ${L.ago}`;
const bar = (n, t) => { const f = t ? Math.round((n / t) * 10) : 0; return "▰".repeat(f) + "▱".repeat(10 - f); };
const spark = (h = []) => { const a = h.slice(-12), m = Math.max(1, ...a); return a.map((x) => SP[Math.min(7, Math.floor((x / m) * 7.99))]).join(""); };
const stats = async () => JSON.parse((await get("stats")) || "{}");
const stamp = () => `🕒 <code>${hhmm(Date.now())} WIB</code>`;
const pad = (k, v) => `${k.padEnd(9)}${v}`;
const home = (L) => btn(`🏠 ${L.b.menu}`, "menu");
const greetIdx = (h) => (h >= 5 && h < 11 ? 1 : h >= 11 && h < 15 ? 2 : h >= 15 && h < 18 ? 3 : 0);
const wibHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false })) % 24;
const dayKey = (i) => new Date(Date.now() + 7 * 3600e3 - i * 86400e3).toISOString().slice(0, 10);
const strip = (d = {}, n = 14) => Array.from({ length: n }, (_, i) => { const e = d[dayKey(n - 1 - i)]; if (!e?.n) return "⬜"; const r = e.ok / e.n; return r >= 0.995 ? "🟩" : r >= 0.95 ? "🟨" : "🟥"; }).join("");

async function probe(L, p) {
  if (p.kind === "web") {
    const o = await checkWeb(p);
    return { p, s: o.status, ms: o.ms, o, sub: o.status === "online" ? `${label(L, o.status, o.ms)} · ${o.ms} ms` : `${L.offline} · ${o.error || "HTTP " + o.code}` };
  }
  const h = await heartbeatState(p);
  return { p, s: h.state, ms: 0, hb: h, sub: `${label(L, h.state, 0)}${h.ageMs == null ? "" : " · " + age(L, h.ageMs)}` };
}
function summary(rows) {
  const c = { g: 0, y: 0, r: 0, w: 0 };
  for (const r of rows) { const d = dot(r.s, r.ms); d === "🟢" ? c.g++ : d === "🟡" ? c.y++ : d === "🔴" ? c.r++ : c.w++; }
  return c;
}
const bannerOf = (L, c) => (c.g + c.y + c.r === 0 ? `⚪ ${L.waiting}` : c.r === 0 ? (c.y ? `🟡 ${L.warn}` : `🟢 ${L.allOk}`) : c.g + c.y === 0 ? `🔴 ${L.major}` : `🟠 ${L.partial}`);

async function render(action, args, L, c) {
  const webs = PRODUCTS.filter((p) => p.kind === "web");
  if (action === "help") return { text: `❓ <b>${L.helpT}</b>\n${LINE}\n${L.helpList.map(([k, d]) => `<code>${esc(k)}</code>\n      ${d}`).join("\n")}`, kb: [[home(L)]] };
  if (action === "lang") return { text: `🌍 <b>${L.chooseLang}</b>`, kb: [[btn("🇮🇩 Indonesia", "setlang:id"), btn("🇬🇧 English", "setlang:en")], [home(L)]] };

  if (action === "status") {
    const rows = await Promise.all(PRODUCTS.map((p) => probe(L, p)));
    const k = summary(rows), on = k.g + k.y;
    const list = rows.map((r) => `${dot(r.s, r.ms)} <b>${esc(r.p.name)}</b>\n      <code>${esc(r.sub)}</code>`).join("\n");
    const kb = [];
    for (let i = 0; i < PRODUCTS.length; i += 2) kb.push(PRODUCTS.slice(i, i + 2).map((p) => btn(`🔍 ${p.name}`, "chk:" + p.id)));
    kb.push([btn(`🔄 ${L.b.refresh}`, "status"), home(L)]);
    return { text: `📡 <b>${L.status}</b>\n<blockquote>${bannerOf(L, k)}</blockquote>\n<code>${bar(on, rows.length)}</code> <b>${on}/${rows.length}</b> ${L.online}\n🟢 ${k.g}   🟡 ${k.y}   🔴 ${k.r}   ⚪ ${k.w}\n${LINE}\n${list}\n${LINE}\n${stamp()}`, kb };
  }

  if (action === "chk") {
    const p = PRODUCTS.find((x) => x.id === args[0]);
    if (!p) return { text: `⚠️ ${L.notfound}`, kb: [[home(L)]] };
    const st = await stats();
    const r = await probe(L, p), s = st[p.id];
    const info = p.kind === "web"
      ? [pad("Status", label(L, r.s, r.ms)), pad("HTTP", String(r.o.code ?? "—")), pad(L.resp, `${r.o.ms} ms`), pad("Uptime", s?.n ? `${((s.ok / s.n) * 100).toFixed(2)}%` : "—"), ...(r.o.error ? [pad(L.reason, r.o.error)] : [])]
      : [pad("Status", label(L, r.s, 0)), pad(L.hb, r.hb.ageMs == null ? "—" : age(L, r.hb.ageMs)), pad(L.ver, r.hb.version || "—")];
    const extra = p.kind === "web" && s?.d ? `\n${strip(s.d)}\n<i>14d</i>${s.h?.length > 1 ? `  <code>${spark(s.h)}</code>` : ""}` : "";
    const link = p.url ? `\n🔗 <a href="${p.url}">${esc(new URL(p.url).hostname)}</a>` : "";
    return { text: `${dot(r.s, r.ms)} <b>${esc(p.name)}</b>\n<i>${p.kind === "web" ? L.typeWeb : L.typeDesk}</i>\n${LINE}\n<pre>${esc(info.join("\n"))}</pre>${extra}${link}\n\n${stamp()}`, kb: [[btn(`🔄 ${L.b.recheck}`, "chk:" + p.id)], [btn(`⬅️ ${L.b.back}`, "status"), home(L)]] };
  }

  if (action === "devs") {
    const nodes = await loadNodes();
    if (!nodes.length) return { text: `🖥 <b>${L.devices}</b>\n${LINE}\n${L.noNodes}\n<pre>SENTINEL_URL=https://${c.host} \\\nSENTINEL_TOKEN=&lt;HEARTBEAT_TOKEN&gt; \\\nnode agent/sentinel-agent.mjs</pre>`, kb: [[home(L)]] };
    const on = nodes.filter((n) => n.state === "online");
    const body = nodes.map((n) => n.state === "offline"
      ? `🔴 <b>${esc(n.name)}</b> · ${L.offline}\n      <code>${L.seen} ${age(L, n.ageMs)}</code>`
      : `${lamp(Math.max(n.cpu, n.ram, n.disk))} <b>${esc(n.name)}</b>${n.os ? ` · <i>${esc(n.os)}</i>` : ""}\n<code>CPU </code>${gauge(n.cpu)} <b>${Math.round(n.cpu)}%</b>\n<code>RAM </code>${gauge(n.ram)} <b>${Math.round(n.ram)}%</b>\n<code>DSK </code>${gauge(n.disk)} <b>${Math.round(n.disk)}%</b>\n      <code>${L.up} ${fmtDur(L, n.up * 1000)} · ${n.rtt} ms</code>`).join("\n\n");
    const kb = [];
    for (let i = 0; i < nodes.length; i += 2) kb.push(nodes.slice(i, i + 2).map((n) => btn(`🖥 ${n.name}`, "nd:" + n.id)));
    kb.push([btn(`🔄 ${L.b.refresh}`, "devs"), home(L)]);
    return { text: `🖥 <b>${L.devices}</b>\n<blockquote>${on.length === nodes.length ? "🟢" : "🟠"} ${on.length}/${nodes.length} ${L.online}</blockquote>\n${LINE}\n${body}\n${LINE}\n${stamp()}`, kb };
  }

  if (action === "nd") {
    const n = (await loadNodes()).find((x) => x.id === args[0]);
    if (!n) return { text: `⚠️ ${L.notfound}`, kb: [[btn(`⬅️ ${L.b.back}`, "devs"), home(L)]] };
    const gb = (a) => (a?.[0] != null && a?.[1] != null ? `${a[0].toFixed(1)} / ${a[1].toFixed(1)} GB` : "—");
    const info = [pad("Host", n.host || "—"), pad("OS", n.os || "—"), pad(L.load, String(n.load)), pad(L.up, fmtDur(L, n.up * 1000)), pad(L.rtt, `${n.rtt} ms`), pad("RAM", gb(n.gb?.ram)), pad("Disk", gb(n.gb?.disk)), pad(L.agent, n.ver ? "v" + n.ver : "—"), pad(L.seen, age(L, n.ageMs))];
    const g = n.state === "online" ? `<code>CPU </code>${gauge(n.cpu)} <b>${Math.round(n.cpu)}%</b>\n<code>RAM </code>${gauge(n.ram)} <b>${Math.round(n.ram)}%</b>\n<code>DSK </code>${gauge(n.disk)} <b>${Math.round(n.disk)}%</b>\n` : "";
    return { text: `${n.state === "online" ? lamp(Math.max(n.cpu, n.ram, n.disk)) : "🔴"} <b>${esc(n.name)}</b>\n<i>${L.detailNode}</i>\n${LINE}\n${g}${n.h?.length > 1 ? `${L.cpuTrend}: <code>${spark(n.h.map((v) => Math.max(1, v)))}</code>\n` : ""}<pre>${esc(info.join("\n"))}</pre>${stamp()}`, kb: [[btn(`🔄 ${L.b.refresh}`, "nd:" + n.id)], [btn(`⬅️ ${L.b.back}`, "devs"), home(L)]] };
  }

  if (action === "up") {
    const st = await stats();
    const rows = webs.map((p) => {
      const s = st[p.id];
      if (!s?.n) return `⚪ <b>${esc(p.name)}</b>\n      <code>—</code>`;
      const pct = (s.ok / s.n) * 100;
      return `${pct >= 99 ? "🟢" : pct >= 95 ? "🟡" : "🔴"} <b>${esc(p.name)}</b> · <b>${pct.toFixed(2)}%</b>\n${strip(s.d)}\n      <code>${L.avg} ${s.ok ? Math.round(s.ms / s.ok) : "—"} ms · ${s.n} ${L.checks}</code>`;
    }).join("\n\n");
    const since = webs.map((p) => st[p.id]?.since).filter(Boolean).sort()[0];
    const foot = since ? `<i>${L.based} ${new Date(since).toLocaleDateString(c.loc, { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" })}</i>` : `<i>${L.noData}</i>`;
    return { text: `📈 <b>${L.uptime}</b>\n${LINE}\n${rows}\n${LINE}\n${L.legend}\n${foot}`, kb: [[btn(`🔄 ${L.b.refresh}`, "up"), home(L)]] };
  }

  if (action === "inc") {
    const hist = (await range("incidents", 10)).map((x) => JSON.parse(x));
    const live = [];
    for (const p of PRODUCTS) {
      const down = p.kind === "web" ? (Number(await get("fail:" + p.id)) || 0) >= 3 : (await get("hbs:" + p.id)) === "offline";
      if (down) { const since = Number(await get("down:" + p.id)) || 0; live.push(`🔴 <b>${esc(p.name)}</b>${since ? `\n      <code>${L.since} ${hhmm(since)} · ${fmtDur(L, Date.now() - since)}</code>` : ""}`); }
    }
    for (const n of (await loadNodes()).filter((x) => x.off)) live.push(`🔴 <b>${esc(n.name)}</b>\n      <code>${L.since} ${hhmm(n.offAt || n.at)} · ${fmtDur(L, Date.now() - (n.offAt || n.at))}</code>`);
    const done = hist.map((i) => `🟢 <b>${esc(i.name)}</b>\n      <code>${hhmm(i.start)} → ${hhmm(i.end)} · ${fmtDur(L, i.end - i.start)}</code>`);
    const mttr = hist.length ? `\n<i>${L.mttr}: ${fmtDur(L, hist.reduce((a, i) => a + (i.end - i.start), 0) / hist.length)}</i>` : "";
    const body = live.length || done.length ? `${live.length ? `<b>${L.ongoing}</b>\n${live.join("\n")}${done.length ? "\n\n" : ""}` : ""}${done.length ? `<b>${L.history}</b>\n${done.join("\n")}` : ""}${mttr}` : `<i>${L.noInc}</i>`;
    return { text: `🚨 <b>${L.incidents}</b>\n${LINE}\n${body}`, kb: [[btn(`🔄 ${L.b.refresh}`, "inc"), home(L)]] };
  }

  if (action === "links") {
    const kb = [];
    for (let i = 0; i < webs.length; i += 2) kb.push(webs.slice(i, i + 2).map((p) => ({ text: `🔗 ${p.name}`, url: p.url })));
    kb.push([{ text: `🌐 ${L.b.web}`, url: c.url }], [home(L)]);
    return { text: `🔗 <b>${L.links}</b>\n${LINE}\n${webs.map((p) => `• <a href="${p.url}">${esc(p.name)}</a>`).join("\n")}`, kb };
  }

  if (action === "notif") {
    const until = Number(await get("mute")) || 0;
    const state = until > Date.now() ? `🔕 ${L.muted} <b>${hhmm(until)} WIB</b>` : `🔔 <b>${L.notifOn}</b>`;
    return { text: `🔔 <b>${L.notif}</b>\n${LINE}\n${state}\n\n<i>${L.note}</i>`, kb: [[btn(`🔕 ${L.mute} 1h`, "mute:60"), btn(`🔕 ${L.mute} 8h`, "mute:480"), btn(`🔕 ${L.mute} 24h`, "mute:1440")], [btn(`🔔 ${L.unmute}`, "mute:0")], [home(L)]] };
  }

  if (action === "sys") {
    const st = await stats();
    const until = Number(await get("mute")) || 0;
    const ca = st._cron ? Date.now() - st._cron : null;
    const info = [pad(L.storage, persistent() ? L.storPerm : L.storMem), pad(L.cron, ca == null ? L.never : age(L, ca) + (ca > 15 * 60_000 ? ` ⚠️ ${L.late}` : "")), pad(L.token, process.env.HEARTBEAT_TOKEN ? L.set : L.unset), pad(L.alerts, until > Date.now() ? `${L.muted} ${hhmm(until)}` : L.notifOn), pad(L.nodes, String((await loadNodes()).length)), pad("TTL", `${HB_TTL / 1000}s`)];
    return { text: `🩺 <b>${L.system}</b>\n${LINE}\n<pre>${esc(info.join("\n"))}</pre>${stamp()}`, kb: [[btn(`🔄 ${L.b.refresh}`, "sys"), home(L)]] };
  }

  if (action === "clr") {
    if (args[0] === "yes") { await del("logs"); await log("INFO", "system", "Log dibersihkan lewat Telegram"); return render("logs", ["ALL"], L, c); }
    return { text: `🧹 <b>${L.b.clear}</b>\n${LINE}\n${L.clrAsk}`, kb: [[btn(`✅ ${L.b.yes}`, "clr:yes"), btn(`✖️ ${L.b.cancel}`, "logs:ALL")]] };
  }

  if (action === "logs") {
    const lv = LEVELS.includes(args[0]) ? args[0] : "ALL";
    const rows = (await range("logs", 200)).map((x) => JSON.parse(x)).filter((l) => lv === "ALL" || l.level === lv).slice(0, 8);
    const body = rows.length ? rows.map((l) => `${LV[l.level]} <code>${hhmm(l.t)}</code> <b>${l.level}</b> · ${esc(l.source)}\n└ ${esc(l.message)}`).join("\n\n") : `<i>${L.empty}</i>`;
    const f = (k, t) => btn(`${lv === k ? "• " : ""}${t}`, "logs:" + k);
    return { text: `📜 <b>${L.logs}</b>${lv === "ALL" ? "" : ` · ${lv}`}\n${LINE}\n${body}\n${LINE}\n${stamp()}`, kb: [[f("ALL", L.b.all), f("INFO", "ℹ️"), f("WARN", "⚠️"), f("ERROR", "❌"), f("FATAL", "🚨")], [btn(`🔄 ${L.b.refresh}`, "logs:" + lv), btn(`🧹 ${L.b.clear}`, "clr")], [home(L)]] };
  }

  // menu utama + ringkasan berwarna dari data cron/agent terakhir
  const st = await stats();
  const rows = await Promise.all(PRODUCTS.map(async (p) => {
    if (p.kind === "desktop") { const h = await heartbeatState(p); return { s: h.state, ms: 0 }; }
    const hs = st[p.id]?.h || [], last = hs[hs.length - 1];
    return last == null ? { s: "unknown", ms: 0 } : { s: last > 0 ? "online" : "offline", ms: last };
  }));
  const k = summary(rows), nodes = await loadNodes();
  const nl = nodes.length ? `   🖥 ${nodes.filter((n) => n.state === "online").length}/${nodes.length}` : "";
  return {
    text: `${L.greet[greetIdx(wibHour())]}, <b>${esc(c.name)}</b> 👋\n📡 <b>Aeryth Monitor</b>\n<blockquote>${L.tag}</blockquote>\n${bannerOf(L, k)}\n🟢 ${k.g}  🟡 ${k.y}  🔴 ${k.r}  ⚪ ${k.w}${nl}\n${LINE}\n${L.pick}`,
    kb: [
      [btn(`📊 ${L.b.status}`, "status"), btn(`🖥 ${L.b.devices}`, "devs")],
      [btn(`📈 ${L.b.uptime}`, "up"), btn(`🚨 ${L.b.inc}`, "inc")],
      [btn(`📜 ${L.b.logs}`, "logs:ALL"), btn(`🔔 ${L.b.notif}`, "notif")],
      [btn(`🔗 ${L.b.links}`, "links"), btn(`🩺 ${L.b.system}`, "sys")],
      [btn(`🌍 ${L.b.lang}`, "lang"), btn(`❓ ${L.b.help}`, "help")],
      [{ text: `🌐 ${L.b.web}`, url: c.url }],
    ],
  };
}

const CMDS = { "/start": "menu", "/menu": "menu", "/web": "links", "/help": "help", "/status": "status", "/lang": "lang", "/logs": "logs", "/check": "chk", "/uptime": "up", "/incidents": "inc", "/insiden": "inc", "/devices": "devs", "/node": "nd", "/links": "links", "/notif": "notif", "/system": "sys", "/silence": "silence", "/unsilence": "unsilence" };

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

  let action, args = [], muteMin = null;
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
    if (action === "nd") {
      const q = rest.join(" ").toLowerCase();
      args = [(q && (await loadNodes()).find((x) => x.id === q || x.name.toLowerCase().includes(q)))?.id || ""];
    }
    if (action === "silence") { const m = /^(\d+)(m|h|d)$/.exec(rest[0] || "1h"); muteMin = m ? Math.min(10080, Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2]]) : 60; action = "mute"; }
    if (action === "unsilence") { muteMin = 0; action = "mute"; }
  }

  let lang = (await get("lang")) || "id";
  let toast;
  if (action === "setlang" && LANGS.includes(args[0])) { lang = args[0]; await set("lang", lang); action = "menu"; toast = getT(lang).langSet; }
  if (action === "mute") {
    const min = muteMin ?? (Number(args[0]) || 0);
    await set("mute", min ? Date.now() + min * 60_000 : 0);
    toast = min ? getT(lang).muteSet : getT(lang).unmuteSet;
    action = "notif";
  }
  const L = getT(lang);
  if (cb) await tg("answerCallbackQuery", { callback_query_id: cb.id, ...(toast ? { text: toast } : {}) });

  const ctx = { url: `https://${req.headers.host}`, host: req.headers.host, name: (cb || u.message).from?.first_name || "Admin", lang, loc: lang === "en" ? "en-GB" : "id-ID" };
  const view = action === "unknown" ? { text: `⚠️ ${L.unknown}`, kb: [[home(L)]] } : await render(action, args, L, ctx);
  const payload = { chat_id: owner, text: view.text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: view.kb } };
  if (cb) await tg("editMessageText", { ...payload, message_id: msg.message_id });
  else await tg("sendMessage", payload);
  send(res, 200, { ok: true });
});
