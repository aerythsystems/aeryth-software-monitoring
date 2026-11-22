import { route, send, readBody, requireToken } from "./_lib.js";
import { get, set, push, log } from "./_store.js";
import { alertEvent } from "./_telegram.js";

const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
const str = (v, n) => (typeof v === "string" && v ? v.slice(0, n) : undefined);
// Mesin alert adaptif: ambang + durasi (jumlah sampel berturut-turut) + histeresis (cooldown & recovery)
const TH = { cpu: { v: 90, n: 5 }, ram: { v: 90, n: 3 }, disk: { v: 92, n: 2 } };

// Telemetri dari Sentinel Agent (PC / server / Termux). Auth: Bearer HEARTBEAT_TOKEN.
export default route(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  if (!requireToken(req, res)) return;
  const b = (await readBody(req)) || {};
  const id = typeof b.id === "string" ? b.id : "";
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(id)) return send(res, 400, { error: "id tidak valid (a-z, 0-9, -; 2-32 karakter)" });
  const m = { cpu: num(b.cpu, 0, 100), ram: num(b.ram, 0, 100), disk: num(b.disk, 0, 100) };
  if (Object.values(m).some((v) => v === null)) return send(res, 400, { error: "cpu, ram, disk wajib angka 0-100" });

  const now = Date.now();
  const prev = JSON.parse((await get("node:" + id)) || "null");
  if (!prev) {
    const ids = JSON.parse((await get("nodes")) || "[]");
    if (!ids.includes(id)) {
      if (ids.length >= 20) return send(res, 400, { error: "Maksimal 20 perangkat" });
      await set("nodes", JSON.stringify([...ids, id]));
    }
  }
  const iv = num(b.iv, 5, 3600) || 60;
  const rec = {
    id, name: str(b.name, 40) || id, os: str(b.os, 40), host: str(b.host, 60), ver: str(b.ver, 20), at: now, iv, ...m,
    load: num(b.load, 0, 9999) ?? 0, up: num(b.up, 0, 1e9) ?? 0, rtt: num(b.rtt, 0, 1e5) ?? 0,
    gb: { ram: [num(b.ramUsed, 0, 1e6), num(b.ramTotal, 0, 1e6)], disk: [num(b.diskUsed, 0, 1e7), num(b.diskTotal, 0, 1e7)] },
    h: [...(prev?.h || []), Math.round(m.cpu)].slice(-20), hi: {}, al: { ...(prev?.al || {}) }, off: false,
  };
  const p = { id, name: rec.name };
  const events = [];
  for (const k of Object.keys(TH)) {
    const val = rec[k], cur = prev?.hi?.[k] || 0;
    if (val >= TH[k].v) {
      rec.hi[k] = cur + 1;
      if (rec.hi[k] >= TH[k].n && !rec.al[k]) { rec.al[k] = true; events.push(["metric", k, val, rec.hi[k] * iv * 1000]); }
    } else if (rec.al[k] && val < TH[k].v - 5) { rec.al[k] = false; events.push(["metricOk", k, val]); }
  }
  await set("node:" + id, JSON.stringify(rec));

  if (!prev) await log("INFO", "node:" + id, `${rec.name} terhubung${rec.ver ? ` (agent v${rec.ver})` : ""}`);
  if (prev?.off) {
    const start = prev.offAt || prev.at;
    await push("incidents", JSON.stringify({ id, name: rec.name, short: rec.name.slice(0, 11), start, end: now }), 50);
    await log("INFO", "node:" + id, `${rec.name} kembali online`);
    await alertEvent("nodeBack", p, { dur: now - start });
  }
  for (const [kind, k, val, forMs] of events) {
    await log(kind === "metric" ? "WARN" : "INFO", "node:" + id, kind === "metric" ? `${rec.name} ${k.toUpperCase()} ${Math.round(val)}% selama ~${Math.round(forMs / 60000)} mnt` : `${rec.name} ${k.toUpperCase()} normal (${Math.round(val)}%)`);
    await alertEvent(kind, p, { k, val, for: forMs });
  }
  send(res, 200, { ok: true, at: now });
});
