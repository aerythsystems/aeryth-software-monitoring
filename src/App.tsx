import { useCallback, useEffect, useState } from "react";

type HB = { state: "online" | "offline" | "not_connected"; at: number | null; ageMs: number | null; version?: string };
type Product = { id: string; name: string; kind: "web" | "desktop"; url?: string; hb?: HB };
type Check = { status: "online" | "offline"; code: number | null; ms: number; at: number; error?: string };
type Hist = Record<string, Check[]>;
type Stat = { n: number; ok: number; ms: number; since: number; h?: number[] };
type Stats = Record<string, Stat>;
type Status = "online" | "offline" | "unknown" | "not_connected";
const LEVELS = ["INFO", "WARN", "ERROR", "FATAL"] as const;
type Level = (typeof LEVELS)[number];
type Log = { t: number; level: Level; source: string; message: string; ip?: string };

const LABEL: Record<Status, string> = { online: "Online", offline: "Offline", unknown: "Belum dicek", not_connected: "Belum terhubung" };
const INTERVAL = 60_000;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
  return data as T;
}
const fmtTime = (t?: number | null) => (t ? new Date(t).toLocaleTimeString("id-ID") : "—");
const fmtShort = (t: number) => new Date(t).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtAge = (ms?: number | null) => (ms == null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)} dtk lalu` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} mnt lalu` : `${Math.round(ms / 3_600_000)} jam lalu`);

function useRoute() {
  const [h, setH] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || "/");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return h;
}

const Pill = ({ s }: { s: Status }) => <span className={`st ${s}`}><i />{LABEL[s]}</span>;
const Tag = ({ l }: { l: Level }) => <span className={`tag ${l}`}>{l}</span>;

function Bars({ data, n = 14, w = 5, h = 18 }: { data: number[]; n?: number; w?: number; h?: number }) {
  const a = data.slice(-n);
  if (!a.length) return <span className="mute">—</span>;
  const m = Math.max(1, ...a);
  return (
    <svg className="bars" width={a.length * w} height={h} viewBox={`0 0 ${a.length * w} ${h}`} aria-hidden="true">
      {a.map((v, i) => {
        const bh = v > 0 ? Math.max(3, Math.round((v / m) * h)) : h;
        return <rect key={i} x={i * w} y={h - bh} width={w - 2} height={bh} rx="1" className={v > 0 ? "ok" : "bad"} />;
      })}
    </svg>
  );
}

function Login({ onLogin }: { onLogin: (u: string) => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { onLogin((await api<{ user: string }>("/api/login", { username: u, password: p })).user); }
    catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="wordmark"><span className="mark">A</span>Aeryth <em>Monitor</em></div>
        <h1>Masuk</h1>
        <p className="mute">Dashboard internal Aeryth Systems.</p>
        <label>Username<input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="err">{err}</div>}
        <button className="btn pri" disabled={busy}>{busy ? "Memproses…" : "Masuk"}</button>
      </form>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const [user, setUser] = useState<string | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [persistent, setPersistent] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [lf, setLf] = useState<Level | "ALL">("ALL");
  const [hist, setHist] = useState<Hist>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);

  const unauth = (e: unknown) => { if ((e as Error).message === "Unauthorized") setUser(null); };
  useEffect(() => { api<{ user: string }>("/api/session").then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    try {
      const r = await api<{ products: Product[]; persistent: boolean; stats?: Stats }>("/api/products");
      setProducts(r.products); setPersistent(r.persistent); setStats(r.stats || {});
      return r.products;
    } catch (e) { unauth(e); return []; }
  }, []);
  const loadLogs = useCallback(async () => {
    try { setLogs((await api<{ logs: Log[] }>("/api/logs?limit=200")).logs); } catch (e) { unauth(e); }
  }, []);
  const checkOne = useCallback(async (id: string) => {
    setBusy((b) => new Set(b).add(id));
    try {
      const c = await api<Check>("/api/check", { id });
      setHist((h) => ({ ...h, [id]: [c, ...(h[id] || [])].slice(0, 50) }));
    } catch (e) { unauth(e); }
    setBusy((b) => { const n = new Set(b); n.delete(id); return n; });
  }, []);
  const cycle = useCallback(async () => {
    setLoading(true);
    const list = await loadProducts();
    await Promise.all(list.filter((p) => p.kind === "web").map((p) => checkOne(p.id)));
    await loadLogs();
    setUpdated(Date.now());
    setLoading(false);
  }, [loadProducts, checkOne, loadLogs]);

  useEffect(() => {
    if (!user) return;
    if (!auto) { loadProducts(); loadLogs(); return; }
    cycle();
    const t = setInterval(cycle, INTERVAL);
    return () => clearInterval(t);
  }, [user, auto, cycle, loadProducts, loadLogs]);

  if (user === undefined) return <div className="center mute">Memuat…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const statusOf = (p: Product): Status => (p.kind === "desktop" ? p.hb?.state ?? "not_connected" : hist[p.id]?.[0]?.status ?? "unknown");
  const lastAt = (p: Product) => (p.kind === "desktop" ? p.hb?.at : hist[p.id]?.[0]?.at);
  const trend = (p: Product): number[] => {
    const s = stats[p.id]?.h;
    if (s && s.length > 1) return s;
    return [...(hist[p.id] || [])].reverse().map((c) => (c.status === "online" ? Math.max(1, c.ms) : 0));
  };
  const uptimeOf = (p: Product) => { const s = stats[p.id]; return s?.n ? `${((s.ok / s.n) * 100).toFixed(2)}%` : "—"; };
  const online = products.filter((p) => statusOf(p) === "online").length;
  const offline = products.filter((p) => statusOf(p) === "offline").length;
  const known = online + offline;
  const webStats = Object.values(stats).filter((s) => s && typeof s === "object" && "n" in s);
  const tn = webStats.reduce((a, s) => a + s.n, 0);
  const totalUptime = tn ? `${((webStats.reduce((a, s) => a + s.ok, 0) / tn) * 100).toFixed(2)}%` : "—";
  const errCount = logs.filter((l) => (l.level === "ERROR" || l.level === "FATAL") && Date.now() - l.t < 86_400_000).length;
  const banner = !known
    ? { k: "unknown", t: "Menunggu hasil pemeriksaan", s: "Pemeriksaan pertama sedang berjalan." }
    : offline === 0 ? { k: "online", t: "Semua sistem berjalan normal", s: `${online} dari ${products.length} produk online.` }
    : online === 0 ? { k: "offline", t: "Gangguan besar", s: "Semua produk yang dipantau sedang offline." }
    : { k: "warn", t: "Sebagian sistem bermasalah", s: `${offline} dari ${known} produk offline.` };
  const logout = async () => { await api("/api/logout", {}).catch(() => {}); setUser(null); setHist({}); };
  const run = <button className="btn pri" disabled={loading} onClick={cycle}>{loading ? "Memeriksa…" : "Periksa semua"}</button>;

  const table = (full?: boolean) => (
    <div className="scroll"><table>
      <thead><tr><th>Produk</th><th>Status</th><th>Respons</th><th>Tren</th><th>Uptime</th>{full && <th>Terakhir</th>}{full && <th />}</tr></thead>
      <tbody>{products.map((p) => {
        const c = hist[p.id]?.[0];
        return (
          <tr key={p.id}>
            <td data-label="Produk" className="nm"><a href={`#/product/${p.id}`}>{p.name}</a><small>{p.url ? new URL(p.url).hostname : "Aplikasi desktop · heartbeat"}</small></td>
            <td data-label="Status"><Pill s={statusOf(p)} /></td>
            <td data-label="Respons" className="num">{p.kind === "web" && c ? `${c.ms} ms` : "—"}</td>
            <td data-label="Tren"><Bars data={trend(p)} /></td>
            <td data-label="Uptime" className="num">{p.kind === "web" ? uptimeOf(p) : "—"}</td>
            {full && <td data-label="Terakhir" className="num mute">{fmtTime(lastAt(p))}</td>}
            {full && <td className="act">{p.kind === "web" && <button className="btn sm" disabled={busy.has(p.id)} onClick={() => checkOne(p.id).then(loadLogs)}>{busy.has(p.id) ? "…" : "Periksa"}</button>}</td>}
          </tr>
        );
      })}</tbody>
    </table></div>
  );
  const logTable = (rows: Log[]) => (
    <div className="scroll"><table>
      <thead><tr><th>Waktu</th><th>Level</th><th>Sumber</th><th>Pesan</th></tr></thead>
      <tbody>{rows.length ? rows.map((l, i) => (
        <tr key={i}>
          <td data-label="Waktu" className="num mute">{fmtShort(l.t)}</td>
          <td data-label="Level"><Tag l={l.level} /></td>
          <td data-label="Sumber" className="mute">{l.source}</td>
          <td data-label="Pesan" className="msg">{l.message}{l.ip ? <span className="mute"> · {l.ip}</span> : null}</td>
        </tr>
      )) : <tr><td colSpan={4} className="mute">Belum ada log.</td></tr>}</tbody>
    </table></div>
  );
  const nav = (to: string, label: string, badge?: number) => (
    <a href={`#${to}`} className={route === to || (to === "/monitoring" && route.startsWith("/product/")) ? "on" : ""}>{label}{badge ? <b className="cnt">{badge}</b> : null}</a>
  );

  let page;
  if (route === "/monitoring") {
    page = <><div className="ph"><div><h1>Monitoring</h1><p>Status, respons, dan uptime setiap produk.</p></div>{run}</div><div className="card">{table(true)}</div></>;
  } else if (route === "/logs") {
    const rows = lf === "ALL" ? logs : logs.filter((l) => l.level === lf);
    page = (
      <>
        <div className="ph"><div><h1>Log</h1><p>Kejadian terbaru, maksimal 500 entri.</p></div>
          <div className="row"><button className="btn" onClick={loadLogs}>Muat ulang</button><button className="btn" onClick={async () => { await api("/api/logs", { action: "clear" }); loadLogs(); }}>Hapus log</button></div></div>
        <div className="seg">{(["ALL", ...LEVELS] as const).map((x) => <button key={x} className={lf === x ? "on" : ""} onClick={() => setLf(x)}>{x === "ALL" ? "Semua" : x}</button>)}</div>
        <div className="card">{logTable(rows)}</div>
        <p className="note">INFO kejadian normal · WARN perlu perhatian (login gagal, lambat, HTTP 4xx) · ERROR gagal (timeout, HTTP 5xx) · FATAL down 3x berturut-turut atau error server.</p>
      </>
    );
  } else if (route.startsWith("/product/")) {
    const p = products.find((x) => x.id === route.slice(9));
    const h = p ? hist[p.id] || [] : [];
    page = !p ? <p className="mute">Produk tidak ditemukan.</p> : (
      <>
        <div className="crumb"><a href="#/monitoring">Monitoring</a> / {p.name}</div>
        <div className="ph"><div><h1>{p.name} <Pill s={statusOf(p)} /></h1>{p.url ? <p><a className="mono" href={p.url} target="_blank" rel="noreferrer">{p.url}</a></p> : <p>Aplikasi desktop · dipantau lewat heartbeat</p>}</div>
          {p.kind === "web" && <button className="btn pri" disabled={busy.has(p.id)} onClick={() => checkOne(p.id).then(loadLogs)}>Periksa sekarang</button>}</div>
        <div className="card kv">
          {p.kind === "web" ? <>
            <div><span>HTTP</span><b className="num">{h[0]?.code ?? "—"}</b></div>
            <div><span>Respons</span><b className="num">{h[0] ? `${h[0].ms} ms` : "—"}</b></div>
            <div><span>Uptime</span><b className="num">{uptimeOf(p)}</b></div>
            <div><span>Pemeriksaan terakhir</span><b className="num">{fmtTime(h[0]?.at)}</b></div>
          </> : <>
            <div><span>Heartbeat terakhir</span><b className="num">{fmtTime(p.hb?.at)}</b></div>
            <div><span>Umur</span><b className="num">{fmtAge(p.hb?.ageMs)}</b></div>
            <div><span>Versi</span><b>{p.hb?.version ?? "—"}</b></div>
            <div><span>ID</span><b className="mono">{p.id}</b></div>
          </>}
        </div>
        {p.kind === "web" && <div className="card pad"><div className="cap">Tren respons (maks. 30 pemeriksaan terakhir)</div><Bars data={trend(p)} n={30} w={14} h={64} /></div>}
        {p.kind === "desktop" ? (
          <p className="note">Online jika heartbeat diterima dalam 90 detik terakhir. Kirim POST ke <code>/api/heartbeat</code> secara berkala (contoh ada di Settings).</p>
        ) : (
          <>
            <h3>Riwayat sesi ini ({h.length})</h3>
            <div className="card"><div className="scroll"><table><thead><tr><th>Waktu</th><th>Status</th><th>HTTP</th><th>Respons</th><th>Catatan</th></tr></thead>
              <tbody>{h.length ? h.map((c, i) => <tr key={i}><td data-label="Waktu" className="num">{fmtTime(c.at)}</td><td data-label="Status"><Pill s={c.status} /></td><td data-label="HTTP" className="num">{c.code ?? "—"}</td><td data-label="Respons" className="num">{c.ms} ms</td><td data-label="Catatan" className="mute">{c.error ?? "—"}</td></tr>) : <tr><td colSpan={5} className="mute">Belum ada pemeriksaan.</td></tr>}</tbody></table></div></div>
          </>
        )}
      </>
    );
  } else if (route === "/settings") {
    page = (
      <>
        <div className="ph"><div><h1>Settings</h1><p>Preferensi dasbor dan informasi sistem.</p></div></div>
        <div className="card rows">
          <div><span>Administrator</span><b>{user}</b></div>
          <div><span>Auto-check</span><label className="inline"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Setiap 60 detik selama dashboard terbuka</label></div>
          <div><span>Penyimpanan</span>{persistent ? <b className="okc">Upstash Redis (permanen)</b> : <b className="warnc">Memori server (sementara)</b>}</div>
          <div><span>Riwayat sesi</span><button className="btn sm" onClick={() => setHist({})}>Hapus</button></div>
          <div><span>Sesi</span><button className="btn sm" onClick={logout}>Keluar</button></div>
        </div>
        <h3>Heartbeat untuk aplikasi non-web</h3>
        <pre className="code">{`curl -X POST ${location.origin}/api/heartbeat \\
  -H "Authorization: Bearer <HEARTBEAT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"prospector-ai","version":"1.0.0"}'`}</pre>
        <p className="note">Kirim tiap 30–60 detik. Uptime dan tren berasal dari pemeriksaan cron di server; riwayat sesi hanya di memori browser. Heartbeat dan log tersimpan di server.</p>
      </>
    );
  } else {
    page = (
      <>
        <div className="ph"><div><h1>Overview</h1><p>Ringkasan seluruh produk Aeryth Systems.</p></div>{run}</div>
        <div className={`banner ${banner.k}`}><div><b>{banner.t}</b><span>{banner.s}</span></div><small>Diperbarui {fmtTime(updated)}</small></div>
        <div className="strip card">
          <div><span>Total produk</span><b>{products.length}</b></div>
          <div><span>Online</span><b className="okc">{online}</b></div>
          <div><span>Offline</span><b className={offline ? "badc" : ""}>{offline}</b></div>
          <div><span>Uptime (cron)</span><b>{totalUptime}</b></div>
        </div>
        <div className="cols">
          <div className="card"><div className="ch">Produk<a href="#/monitoring">Lihat semua</a></div>{table()}</div>
          <div className="card"><div className="ch">Aktivitas<a href="#/logs">Semua log</a></div>
            <ul className="feed">{logs.length ? logs.slice(0, 8).map((l, i) => <li key={i}><Tag l={l.level} /><span>{l.message}</span><time>{fmtShort(l.t)}</time></li>) : <li className="mute">Belum ada aktivitas.</li>}</ul></div>
        </div>
      </>
    );
  }

  return (
    <div className="shell">
      <aside>
        <div className="wordmark"><span className="mark">A</span>Aeryth <em>Monitor</em></div>
        <nav>{nav("/", "Overview")}{nav("/monitoring", "Monitoring")}{nav("/logs", "Log", errCount)}{nav("/settings", "Settings")}</nav>
        <div className="side-foot">
          <div className="live"><i className={auto ? "on" : ""} />{auto ? "Auto-check aktif" : "Auto-check mati"}</div>
          <div className="who"><span>{user}</span><button onClick={logout}>Keluar</button></div>
        </div>
      </aside>
      <main>{page}</main>
    </div>
  );
}
