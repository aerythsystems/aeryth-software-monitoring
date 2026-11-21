import { guard, auth, readBody, send, route, PRODUCTS } from "./_lib.js";
import { checkWeb } from "./_monitor.js";
export default route(async (req, res) => {
  if (!guard(req, res, "POST") || !auth(req, res)) return;
  const b = await readBody(req);
  const p = PRODUCTS.find((x) => x.id === b?.id);
  if (!p) return send(res, 404, { error: "Produk tidak ditemukan" });
  if (p.kind !== "web") return send(res, 400, { error: "Produk ini bukan website" });
  // Klien hanya mengirim id; URL dari daftar bawaan, hostname diverifikasi ulang.
  const allowed = new Set(PRODUCTS.filter((x) => x.url).map((x) => new URL(x.url).hostname));
  if (!allowed.has(new URL(p.url).hostname)) return send(res, 403, { error: "Hostname tidak diizinkan" });
  send(res, 200, await checkWeb(p));
});
