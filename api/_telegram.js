import { get } from "./_store.js";
import { getT } from "./_i18n.js";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const telegramOn = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
export const hhmm = (t) => new Date(t).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":");
// Indikator lampu & gauge berwarna: hijau < 70, kuning < 90, merah >= 90
export const lamp = (v) => (v >= 90 ? "🔴" : v >= 70 ? "🟡" : "🟢");
export const gauge = (v) => { const f = Math.max(0, Math.min(10, Math.round(v / 10))); return (v >= 90 ? "🟥" : v >= 70 ? "🟨" : "🟩").repeat(f) + "⬜".repeat(10 - f); };
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

// Alert otomatis (kartu berwarna), mengikuti bahasa pilihan pemilik.
export async function alertEvent(kind, p, x = {}) {
  if (!telegramOn()) return;
  if ((Number(await get("mute").catch(() => 0)) || 0) > Date.now()) return; // dibisukan
  const L = getT(await get("lang").catch(() => null));
  const dur = x.dur ? `\n⏱ ${L.lasted}: <b>${fmtDur(L, x.dur)}</b>` : "";
  const since = x.since ? `\n🕐 ${L.since}: <code>${hhmm(x.since)} WIB</code>` : "";
  const label = x.k ? L[x.k] : "";
  const d = {
    down: ["🚨", L.alertDown, `❗ ${L.failed3}\n📎 ${L.reason}: <code>${esc(x.why)}</code>${since}`],
    up: ["🟢", L.alertUp, `✅ ${L.recovered}\n📎 HTTP <code>${x.code}</code> · <code>${x.ms} ms</code>${dur}`],
    hbLost: ["🔴", L.hbLost, `❗ ${L.noHb.replace("{s}", x.secs)}${since}`],
    hbBack: ["🟢", L.hbBack, `✅ ${L.recovered}${dur}`],
    nodeLost: ["🔴", L.nodeLost, `❗ ${L.noHb.replace("{s}", x.secs)}${since}`],
    nodeBack: ["🟢", L.nodeBack, `✅ ${L.recovered}${dur}`],
    metric: [x.val >= 97 ? "🔴" : "🟡", L[x.k + "High"], `${gauge(x.val)} <b>${Math.round(x.val)}%</b>\n⏱ ${L.sustained}: <b>${fmtDur(L, x.for)}</b>`],
    metricOk: ["🟢", L.normal, `${gauge(x.val)} <b>${Math.round(x.val)}%</b>\n✅ ${label || ""}`.trim()],
  }[kind];
  const cb = kind.startsWith("node") || kind.startsWith("metric") ? "nd:" + p.id : "chk:" + p.id;
  await notify(`${d[0]} <b>${d[1]}</b>\n<b>${esc(p.name)}</b>${kind.startsWith("metric") ? ` · <i>${x.k.toUpperCase()}</i>` : ""}\n━━━━━━━━━━━━━━━\n${d[2]}\n\n🕒 <code>${hhmm(Date.now())} WIB</code>`, [[{ text: `🔍 ${L.b.recheck}`, callback_data: cb }]]);
}
