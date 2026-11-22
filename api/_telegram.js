import { get } from "./_store.js";
import { getT } from "./_i18n.js";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const telegramOn = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
export const hhmm = (t) => new Date(t).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":");
export function fmtDur(L, ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} ${L.u[0]}` : s < 3600 ? `${Math.round(s / 60)} ${L.u[1]}` : `${(s / 3600).toFixed(1)} ${L.u[2]}`;
}

// Panggil Telegram Bot API. Tidak pernah melempar error.
export async function tg(method, body) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
    });
    return await r.json();
  } catch (e) { console.error("telegram gagal:", e.message); return null; }
}
export function notify(text, kb) {
  const chat_id = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chat_id) return null;
  return tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}) });
}

// Alert otomatis: ringkas, tabel monospace, mengikuti bahasa pilihan pemilik.
export async function alertEvent(kind, p, x = {}) {
  if (!telegramOn()) return;
  if ((Number(await get("mute").catch(() => 0)) || 0) > Date.now()) return; // dibisukan
  const L = getT(await get("lang").catch(() => null));
  const row = (k, v) => `${k.padEnd(10)}${v}`;
  const at = x.since ? [row(L.since, hhmm(x.since) + " WIB")] : [];
  const d = {
    down: ["🔴", L.alertDown, [row(L.reason, x.why), row(L.fails, L.failsVal), ...at]],
    up: ["🟢", L.alertUp, [row("Status", `HTTP ${x.code} · ${x.ms} ms`), ...(x.dur ? [row(L.lasted, fmtDur(L, x.dur))] : [])]],
    hbLost: ["🔴", L.hbLost, [row(L.reason, L.noHb.replace("{s}", x.secs)), ...at]],
    hbBack: ["🟢", L.hbBack, x.dur ? [row(L.lasted, fmtDur(L, x.dur))] : [row("Status", L.online)]],
  }[kind];
  await notify(`${d[0]} <b>${esc(p.name)}</b> · ${d[1]}\n<pre>${esc(d[2].join("\n"))}</pre><code>${hhmm(Date.now())} WIB</code>`, [[{ text: `↻ ${L.recheck}`, callback_data: "chk:" + p.id }]]);
}
