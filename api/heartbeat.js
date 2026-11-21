import { send, readBody, safeEq, route, ip, PRODUCTS, HB_TTL } from "./_lib.js";
import { get, set, log } from "./_store.js";
// Dipanggil aplikasi non-web: POST dengan header "Authorization: Bearer <HEARTBEAT_TOKEN>"
export default route(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const tok = process.env.HEARTBEAT_TOKEN;
  if (!tok || tok.length < 16 || !process.env.SESSION_SECRET) return send(res, 503, { error: "HEARTBEAT_TOKEN belum dikonfigurasi" });
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m || !safeEq(m[1], tok)) {
    await log("WARN", "heartbeat", "Heartbeat ditolak: token salah", { ip: ip(req) });
    return send(res, 401, { error: "Unauthorized" });
  }
  const b = await readBody(req);
  const p = PRODUCTS.find((x) => x.id === b?.id && x.kind === "desktop");
  if (!p) return send(res, 400, { error: "id tidak valid (harus produk desktop)" });
  const version = typeof b.version === "string" ? b.version.slice(0, 40) : undefined;
  const prev = JSON.parse((await get("hb:" + p.id)) || "null");
  const now = Date.now();
  await set("hb:" + p.id, JSON.stringify({ at: now, version }));
  if (!prev || now - prev.at > HB_TTL) await log("INFO", p.id, `${p.name} terhubung${version ? ` (v${version})` : ""}`);
  send(res, 200, { ok: true, at: now });
});
