import { guard, auth, send, route } from "./_lib.js";
import { loadNodes } from "./_monitor.js";
export default route(async (req, res) => {
  if (!guard(req, res, "GET") || !auth(req, res)) return;
  send(res, 200, { nodes: await loadNodes() });
});
