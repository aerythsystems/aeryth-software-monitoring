import { HB_TTL } from "./_lib.js";
import { get, set, incr, push, log, mget } from "./_store.js";
import { alertEvent } from "./_telegram.js";

const incident = (p, start) => start && push("incidents", JSON.stringify({ id: p.id, name: p.name, short: p.short, start, end: Date.now() }), 50);

// Periksa satu website, catat log & insiden, kirim alert Telegram saat DOWN 3x / pulih.
export async function checkWeb(p) {
  const t = Date.now();
  let out;
  try {
    const r = await fetch(p.url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "AerythSoftwareMonitor/1.0" } });
    out = { status: r.status < 400 ? "online" : "offline", code: r.status, ms: Date.now() - t, at: Date.now() };
  } catch (e) {
    out = { status: "offline", code: null, ms: Date.now() - t, at: Date.now(), error: e.name === "TimeoutError" ? "Timeout (8 dtk)" : "Tidak dapat dijangkau" };
  }
  const key = "fail:" + p.id, dkey = "down:" + p.id;
  const prev = Number(await get(key)) || 0;
  if (out.status === "online") {
    if (prev > 0) {
      await set(key, 0);
      await log("INFO", p.id, `${p.name} pulih (HTTP ${out.code}, ${out.ms} ms)`);
      if (prev >= 3) {
        const since = Number(await get(dkey)) || 0;
        await incident(p, since);
        await alertEvent("up", p, { code: out.code, ms: out.ms, dur: since ? Date.now() - since : 0 });
      }
    }
    if (out.ms > 3000) await log("WARN", p.id, `${p.name} lambat: ${out.ms} ms`);
  } else {
    const n = await incr(key);
    if (n === 1) await set(dkey, Date.now());
    const why = out.error || `HTTP ${out.code}`;
    const level = n === 3 ? "FATAL" : out.code && out.code < 500 ? "WARN" : "ERROR";
    await log(level, p.id, n === 3 ? `${p.name} DOWN 3x berturut-turut (${why})` : `${p.name} gagal: ${why}`);
    if (n === 3) await alertEvent("down", p, { why, since: Number(await get(dkey)) || Date.now() });
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
      const since = h.at + HB_TTL;
      await set("down:" + p.id, since);
      await log("FATAL", p.id, `${p.name} tidak mengirim heartbeat > ${HB_TTL / 1000} dtk`);
      await alertEvent("hbLost", p, { secs: HB_TTL / 1000, since });
    } else if (prev === "offline") {
      const since = Number(await get("down:" + p.id)) || 0;
      await incident(p, since);
      await log("INFO", p.id, `${p.name} heartbeat kembali`);
      await alertEvent("hbBack", p, { dur: since ? Date.now() - since : 0 });
    }
  }
  return h;
}

export const nodeState = (r) => (r.off || Date.now() - r.at > HB_TTL ? "offline" : "online");
export async function loadNodes() {
  const ids = JSON.parse((await get("nodes")) || "[]");
  if (!ids.length) return [];
  return (await mget(ids.map((i) => "node:" + i))).filter(Boolean).map((x) => { const r = JSON.parse(x); return { ...r, state: nodeState(r), ageMs: Date.now() - r.at }; });
}
// Dipanggil cron: tandai perangkat yang berhenti melapor.
export async function checkNodes() {
  const out = [];
  for (const r of await loadNodes()) {
    if (r.state === "offline" && !r.off) {
      const { state, ageMs, ...rec } = r;
      rec.off = true; rec.offAt = r.at + HB_TTL;
      await set("node:" + r.id, JSON.stringify(rec));
      await log("FATAL", "node:" + r.id, `${r.name} berhenti melapor > ${HB_TTL / 1000} dtk`);
      await alertEvent("nodeLost", { id: r.id, name: r.name }, { secs: HB_TTL / 1000, since: rec.offAt });
    }
    out.push({ id: r.id, state: r.state });
  }
  return out;
}
