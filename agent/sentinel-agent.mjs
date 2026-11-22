#!/usr/bin/env node
// Sentinel Agent — tanpa dependency (Node >= 18.15). Jalan di Windows, Linux, macOS, Termux.
// Pakai:  SENTINEL_URL=https://domain.vercel.app SENTINEL_TOKEN=xxxx node agent/sentinel-agent.mjs
// Opsional: SENTINEL_ID (a-z0-9-), SENTINEL_NAME, SENTINEL_INTERVAL (detik, default 60)
import os from "node:os";
import fs from "node:fs";

const URL_ = (process.env.SENTINEL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.SENTINEL_TOKEN || "";
const ID = process.env.SENTINEL_ID || os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "node";
const NAME = process.env.SENTINEL_NAME || os.hostname();
const IV = Math.max(10, Number(process.env.SENTINEL_INTERVAL) || 60);
if (!URL_ || !TOKEN) { console.error("Set SENTINEL_URL dan SENTINEL_TOKEN."); process.exit(1); }

const times = () => { let idle = 0, total = 0; for (const c of os.cpus()) { for (const t of Object.values(c.times)) total += t; idle += c.times.idle; } return { idle, total }; };
let last = times();
function cpu() {
  const n = times(), di = n.idle - last.idle, dt = n.total - last.total; last = n;
  if (dt > 0) return Math.round((1 - di / dt) * 100);
  const cores = os.cpus().length || 1; // fallback (mis. Android membatasi /proc/stat)
  return Math.min(100, Math.round((os.loadavg()[0] / cores) * 100));
}
function mem() {
  const total = os.totalmem();
  let free = os.freemem();
  try { const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync("/proc/meminfo", "utf8")); if (m) free = Number(m[1]) * 1024; } catch { /* non-Linux */ }
  return { used: total - free, total };
}
function disk() {
  try { const s = fs.statfsSync(process.platform === "win32" ? "C:\\" : "/"); const total = s.bsize * s.blocks; return { used: total - s.bsize * s.bavail, total }; }
  catch { return { used: 0, total: 0 }; }
}
const gb = (b) => Math.round((b / 1073741824) * 10) / 10;
const pct = (u, t) => (t ? Math.round((u / t) * 100) : 0);
const hhmmss = () => new Date().toLocaleTimeString("id-ID");
let rtt = 0;

async function tick() {
  const m = mem(), d = disk(), c = cpu();
  const body = { id: ID, name: NAME, os: `${os.type()} ${os.release()}`.slice(0, 40), host: os.hostname(), ver: "1.0", iv: IV,
    cpu: c, ram: pct(m.used, m.total), disk: pct(d.used, d.total), load: Math.round(os.loadavg()[0] * 100) / 100, up: Math.round(os.uptime()), rtt,
    ramUsed: gb(m.used), ramTotal: gb(m.total), diskUsed: gb(d.used), diskTotal: gb(d.total) };
  const t = Date.now();
  try {
    const r = await fetch(`${URL_}/api/agent`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    rtt = Date.now() - t;
    console.log(`[${hhmmss()}] ${r.ok ? "OK " : "ERR " + r.status}  cpu ${body.cpu}%  ram ${body.ram}%  disk ${body.disk}%  rtt ${rtt}ms`);
  } catch (e) { console.log(`[${hhmmss()}] gagal kirim: ${e.message} (coba lagi ${IV} dtk)`); }
}
console.log(`Sentinel Agent · id=${ID} · tiap ${IV}s → ${URL_}`);
setTimeout(tick, 1500);
setInterval(tick, IV * 1000);
