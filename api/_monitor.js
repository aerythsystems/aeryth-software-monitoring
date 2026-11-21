import { HB_TTL } from "./_lib.js";
import { get, set, incr, log } from "./_store.js";
import { notify, esc } from "./_telegram.js";

// Periksa satu website, catat log, dan kirim alert Telegram saat DOWN 3x / pulih.
export async function checkWeb(p) {
  const t = Date.now();
  let out;
  try {
    const r = await fetch(p.url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "AerythSoftwareMonitor/1.0" } });
    out = { status: r.status < 400 ? "online" : "offline", code: r.status, ms: Date.now() - t, at: Date.now() };
  } catch (e) {
    out = { status: "offline", code: null, ms: Date.now() - t, at: Date.now(), error: e.name === "TimeoutError" ? "Timeout (8 dtk)" : "Tidak dapat dijangkau" };
  }
  const key = "fail:" + p.id;
  const prev = Number(await get(key)) || 0;
  if (out.status === "online") {
    if (prev > 0) {
      await set(key, 0);
      await log("INFO", p.id, `${p.name} pulih (HTTP ${out.code}, ${out.ms} ms)`);
      if (prev >= 3) await notify(`🟢 <b>${esc(p.name)}</b> pulih (HTTP ${out.code}, ${out.ms} ms)`);
    }
    if (out.ms > 3000) await log("WARN", p.id, `${p.name} lambat: ${out.ms} ms`);
  } else {
    const n = await incr(key);
    const why = out.error || `HTTP ${out.code}`;
    const level = n === 3 ? "FATAL" : out.code && out.code < 500 ? "WARN" : "ERROR";
    await log(level, p.id, n === 3 ? `${p.name} DOWN 3x berturut-turut (${why})` : `${p.name} gagal: ${why}`);
    if (n === 3) await notify(`🔴 <b>${esc(p.name)}</b> DOWN 3x berturut-turut (${esc(why)})`);
  }
  return out;
}

export async function heartbeatState(p) {
  const hb = JSON.parse((await get("hb:" + p.id)) || "null");
  if (!hb) return { state: "not_connected", at: null, ageMs: null };
  const age = Date.now() - hb.at;
  return { state: age <= HB_TTL ? "online" : "offline", at: hb.at, ageMs: age, version: hb.version };
}

// Dipanggil cron: alert saat heartbeat berhenti / kembali.
export async function checkHeartbeat(p) {
  const h = await heartbeatState(p);
  const prev = await get("hbs:" + p.id);
  if (h.state !== "not_connected" && h.state !== prev) {
    await set("hbs:" + p.id, h.state);
    if (h.state === "offline") {
      await log("FATAL", p.id, `${p.name} tidak mengirim heartbeat > ${HB_TTL / 1000} dtk`);
      await notify(`🔴 <b>${esc(p.name)}</b> berhenti mengirim heartbeat (> ${HB_TTL / 1000} dtk)`);
    } else if (prev === "offline") {
      await log("INFO", p.id, `${p.name} heartbeat kembali`);
      await notify(`🟢 <b>${esc(p.name)}</b> heartbeat kembali`);
    }
  }
  return h;
}
