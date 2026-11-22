// Penyimpanan: Upstash Redis (REST, free tier) bila dikonfigurasi, jika tidak memori proses (sementara).
const mem = new Map();
// Mendukung nama variabel dari Upstash langsung (UPSTASH_REDIS_REST_*) maupun integrasi Vercel (KV_REST_API_*)
const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const persistent = () => !!(redisUrl() && redisToken());
async function cmd(args) {
  const r = await fetch(redisUrl(), {
    method: "POST", headers: { authorization: "Bearer " + redisToken() }, body: JSON.stringify(args),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "store error");
  return j.result;
}
export const get = async (k) => (persistent() ? cmd(["GET", k]) : mem.get(k) ?? null);
export const set = async (k, v) => { if (persistent()) await cmd(["SET", k, String(v)]); else mem.set(k, String(v)); };
export const del = async (k) => { if (persistent()) await cmd(["DEL", k]); else mem.delete(k); };
export async function incr(k) {
  if (persistent()) return cmd(["INCR", k]);
  const n = Number(mem.get(k) || 0) + 1; mem.set(k, String(n)); return n;
}
export async function push(k, v, max) {
  if (persistent()) { await cmd(["LPUSH", k, v]); await cmd(["LTRIM", k, 0, max - 1]); return; }
  mem.set(k, [v, ...(mem.get(k) || [])].slice(0, max));
}
export const range = async (k, n) => (persistent() ? (await cmd(["LRANGE", k, 0, n - 1])) || [] : (mem.get(k) || []).slice(0, n));
// Level: INFO < WARN < ERROR < FATAL. Tidak pernah melempar error.
export async function log(level, source, message, meta = {}) {
  try { await push("logs", JSON.stringify({ t: Date.now(), level, source, message, ...meta }), 500); }
  catch (e) { console.error("log gagal:", e.message); }
}
export const mget = async (keys) => (persistent() ? (await cmd(["MGET", ...keys])) || [] : keys.map((k) => mem.get(k) ?? null));
