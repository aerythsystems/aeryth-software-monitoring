import { guard, auth, send, route } from "./_lib.js";
export default route(async (req, res) => {
  if (!guard(req, res, "GET")) return;
  const user = auth(req, res);
  if (user) send(res, 200, { user });
});
