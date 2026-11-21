import { PRODUCTS, route, safeEq, send, readBody } from "./_lib.js";
import { checkWeb, heartbeatState } from "./_monitor.js";
import { range } from "./_store.js";
import { notify, esc } from "./_telegram.js";

const ICON = { online: "🟢", offline: "🔴", not_connected: "⚪" };
const LABEL = { online: "Online", offline: "Offline", not_connected: "Not Connected" };
const LEVELS = ["INFO", "WARN", "ERROR", "FATAL"];
const age = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)} dtk lalu` : `${Math.round(ms / 60_000)} mnt lalu`);
const HELP = `<b>Aeryth Monitor</b>
/status — status semua produk (dicek langsung)
/check &lt;nama&gt; — cek satu produk
/logs [info|warn|error|fatal] — 10 log terakhir
/web — link dashboard
/help — bantuan`;

async function line(p) {
  if (p.kind === "web") {
    const o = await checkWeb(p);
    const s = o.status;
    return { s, text: `${ICON[s]} <b>${esc(p.name)}</b> — ${LABEL[s]} (${s === "online" ? o.ms + " ms" : esc(o.error || "HTTP " + o.code)})` };
  }
  const h = await heartbeatState(p);
  return { s: h.state, text: `${ICON[h.state]} <b>${esc(p.name)}</b> — ${LABEL[h.state]} (${h.ageMs == null ? "belum ada heartbeat" : "heartbeat " + age(h.ageMs)})` };
}

async function handle(cmd, args, req) {
  if (cmd === "/start" || cmd === "/help") return HELP;
  if (cmd === "/web") return `https://${req.headers.host}`;
  if (cmd === "/status") {
    const rows = await Promise.all(PRODUCTS.map(line));
    return `<b>Status produk</b> (${rows.filter((r) => r.s === "online").length}/${rows.length} online)\n\n` + rows.map((r) => r.text).join("\n");
  }
  if (cmd === "/check") {
    const q = args.join(" ").toLowerCase();
    const p = q && PRODUCTS.find((x) => x.id === q || x.name.toLowerCase().includes(q));
    return p ? (await line(p)).text : "Produk tidak ditemukan. Contoh: /check trebee";
  }
  if (cmd === "/logs") {
    const lv = (args[0] || "").toUpperCase();
    if (lv && !LEVELS.includes(lv)) return "Level: info, warn, error, atau fatal";
    const rows = (await range("logs", 200)).map((x) => JSON.parse(x)).filter((l) => !lv || l.level === lv).slice(0, 10);
    if (!rows.length) return "Belum ada log.";
    return rows.map((l) => `<code>${new Date(l.t).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</code> <b>${l.level}</b> ${esc(l.message)}`).join("\n");
  }
  return "Perintah tidak dikenal. Ketik /help";
}

export default route(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const sec = process.env.TELEGRAM_WEBHOOK_SECRET, owner = process.env.TELEGRAM_CHAT_ID;
  if (!sec || !owner || !process.env.TELEGRAM_BOT_TOKEN || !process.env.SESSION_SECRET) return send(res, 503, { error: "Telegram belum dikonfigurasi" });
  if (!safeEq(String(req.headers["x-telegram-bot-api-secret-token"] || ""), sec)) return send(res, 401, { error: "Unauthorized" });
  const msg = (await readBody(req))?.message;
  const text = typeof msg?.text === "string" ? msg.text.trim() : "";
  // Hanya pemilik (chat ID terdaftar) yang dilayani.
  if (!msg || String(msg.chat?.id) !== String(owner) || !text.startsWith("/")) return send(res, 200, { ok: true });
  const [raw, ...args] = text.split(/\s+/);
  await notify(await handle(raw.split("@")[0].toLowerCase(), args, req), owner);
  send(res, 200, { ok: true });
});
