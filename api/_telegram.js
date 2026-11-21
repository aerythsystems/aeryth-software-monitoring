import { get } from "./_store.js";
import { getT } from "./_i18n.js";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const telegramOn = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
export const hhmm = (t) => new Date(t).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":");

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

// Alert otomatis, mengikuti bahasa pilihan pemilik.
export async function alertEvent(kind, p, x = {}) {
  if (!telegramOn()) return;
  const L = getT(await get("lang").catch(() => null));
  const rows = {
    down: ["🚨", L.alertDown, `❗ ${L.failed3}\n📎 ${L.reason}: <code>${esc(x.why)}</code>`],
    up: ["🟢", L.alertUp, `✅ ${L.recovered}\n📎 HTTP <code>${x.code}</code> · <code>${x.ms} ms</code>`],
    hbLost: ["🔴", L.hbLost, `❗ ${L.noHb.replace("{s}", x.secs)}`],
    hbBack: ["🟢", L.hbBack, `✅ ${L.recovered}`],
  }[kind];
  const text = `${rows[0]} <b>${rows[1]}</b>\n<b>${esc(p.name)}</b>\n━━━━━━━━━━━━━━━\n${rows[2]}\n\n🕒 <code>${hhmm(Date.now())} WIB</code>`;
  await notify(text, [[{ text: `🔍 ${L.bRecheck}`, callback_data: "chk:" + p.id }]]);
}
