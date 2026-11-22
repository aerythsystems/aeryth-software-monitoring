import { guard, auth, send, route, PRODUCTS } from "./_lib.js";
import { persistent, get } from "./_store.js";
import { heartbeatState } from "./_monitor.js";
export default route(async (req, res) => {
  if (!guard(req, res, "GET") || !auth(req, res)) return;
  const products = await Promise.all(PRODUCTS.map(async (p) => (p.kind === "desktop" ? { ...p, hb: await heartbeatState(p) } : p)));
  const stats = JSON.parse((await get("stats")) || "{}");
  send(res, 200, { products, persistent: persistent(), stats });
});
