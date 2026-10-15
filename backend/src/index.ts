// Monsoon sync API (a Neon Function).
//
// The site lives on GitHub Pages, a different site from Neon Auth, and browsers (Safari above all)
// block the cross-site cookie Neon Auth uses for sessions. So this Function fronts Neon Auth:
// it forwards sign-up / sign-in / etc., hands the browser its session token to keep, and turns
// that token back into the session cookie on every later call. Progress routes only ever read or
// write the row of the user the session belongs to.
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const AUTH = process.env.NEON_AUTH_BASE_URL!.replace(/\/$/, "");
const COOKIE = "__Secure-neon-auth.session_token";
const SITE = "https://faarisaahmed.github.io";
const ALLOWED = [/^https:\/\/faarisaahmed\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const MAX_BYTES = 2_000_000; // a very active learner's data is far below this

type User = { id: string; email: string; name: string };
type Env = { Variables: { user: User; token: string } };
const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: (origin) => (ALLOWED.some((re) => re.test(origin)) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  }),
);

app.get("/", (c) => c.text("Monsoon sync API"));

// ---------- talking to Neon Auth ----------
function authFetch(c: Context, path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const origin = c.req.header("origin") || "";
  const headers: Record<string, string> = {
    // Neon Auth only accepts requests from trusted origins
    Origin: ALLOWED.some((re) => re.test(origin)) ? origin : SITE,
    "Content-Type": "application/json",
  };
  const ip = c.req.header("x-forwarded-for");
  if (ip) headers["X-Forwarded-For"] = ip; // keep Better Auth's per-IP rate limits per user, not per Function
  if (init.token) headers.Cookie = `${COOKIE}=${init.token}`;
  return fetch(AUTH + path, {
    method: init.method || (init.body ? "POST" : "GET"),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

const sessionFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);

const publicUser = (u: { id: string; email: string; name: string }): User => ({ id: u.id, email: u.email, name: u.name });

async function relayError(c: Context, res: Response) {
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  return c.json({ error: body.message || "Request failed", code: body.code }, res.status as 400);
}

// Session token -> user, cached briefly so progress saves don't hit Neon Auth every time.
// Returns null for an invalid/expired session; throws a Response if Neon Auth is unavailable or
// rate limiting, so a temporary problem is never mistaken for being signed out.
const cache = new Map<string, { user: User; until: number }>();
async function userFor(c: Context, token: string): Promise<User | null> {
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const res = await authFetch(c, "/get-session", { token });
  if (res.status === 429 || res.status >= 500) throw c.json({ error: "The sign-in service is busy. Please try again in a moment." }, 503);
  const body = res.ok ? ((await res.json()) as { user?: User } | null) : null;
  if (!body?.user) {
    cache.delete(token);
    return null;
  }
  const user = publicUser(body.user);
  if (cache.size > 5000) cache.clear();
  cache.set(token, { user, until: Date.now() + 5 * 60e3 });
  return user;
}

const requireUser = async (c: Context<Env>, next: () => Promise<void>) => {
  const header = c.req.header("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  let user: User | null = null;
  try {
    user = token ? await userFor(c, token) : null;
  } catch (busy) {
    return busy as Response;
  }
  if (!user) return c.json({ error: "Your session has ended. Please sign in again." }, 401);
  c.set("user", user);
  c.set("token", token);
  await next();
};

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length <= max ? v : "");

// ---------- auth routes ----------
app.post("/auth/sign-up", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email).trim(), password = str(b.password, 128), name = str(b.name, 80).trim();
  if (!email || password.length < 8) return c.json({ error: "Enter an email and a password of at least 8 characters." }, 400);
  const res = await authFetch(c, "/sign-up/email", { body: { email, password, name: name || email.split("@")[0] } });
  if (!res.ok) return relayError(c, res);
  const body = (await res.json()) as { user: User };
  return c.json({ session: sessionFrom(res), user: publicUser(body.user) });
});

app.post("/auth/sign-in", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const res = await authFetch(c, "/sign-in/email", { body: { email: str(b.email).trim(), password: str(b.password, 128) } });
  if (!res.ok) return relayError(c, res);
  const body = (await res.json()) as { user: User };
  return c.json({ session: sessionFrom(res), user: publicUser(body.user) });
});

app.get("/auth/session", requireUser, (c) => c.json({ user: c.get("user") }));

app.post("/auth/sign-out", requireUser, async (c) => {
  cache.delete(c.get("token"));
  await authFetch(c, "/sign-out", { body: {}, token: c.get("token") });
  return c.json({ ok: true });
});

app.post("/auth/update-name", requireUser, async (c) => {
  const name = str((await c.req.json().catch(() => ({}))).name, 80).trim();
  if (!name) return c.json({ error: "Enter a name." }, 400);
  const res = await authFetch(c, "/update-user", { body: { name }, token: c.get("token") });
  if (!res.ok) return relayError(c, res);
  cache.delete(c.get("token"));
  return c.json({ user: { ...c.get("user"), name } });
});

app.post("/auth/change-password", requireUser, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const newPassword = str(b.newPassword, 128);
  if (newPassword.length < 8) return c.json({ error: "New password must be at least 8 characters." }, 400);
  const res = await authFetch(c, "/change-password", { body: { currentPassword: str(b.currentPassword, 128), newPassword }, token: c.get("token") });
  if (!res.ok) return relayError(c, res);
  return c.json({ ok: true });
});

// Forgotten password: a 6-digit code is emailed, then exchanged for a new password.
app.post("/auth/forgot", async (c) => {
  const email = str((await c.req.json().catch(() => ({}))).email).trim();
  if (!email) return c.json({ error: "Enter your email." }, 400);
  const res = await authFetch(c, "/email-otp/send-verification-otp", { body: { email, type: "forget-password" } });
  if (!res.ok) return relayError(c, res);
  return c.json({ ok: true });
});

app.post("/auth/reset", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const password = str(b.password, 128);
  if (password.length < 8) return c.json({ error: "New password must be at least 8 characters." }, 400);
  const res = await authFetch(c, "/email-otp/reset-password", { body: { email: str(b.email).trim(), otp: str(b.otp, 20).trim(), password } });
  if (!res.ok) return relayError(c, res);
  return c.json({ ok: true });
});

// Permanently delete the account and its progress (password required).
app.post("/auth/delete", requireUser, async (c) => {
  const user = c.get("user");
  const check = await authFetch(c, "/sign-in/email", { body: { email: user.email, password: str((await c.req.json().catch(() => ({}))).password, 128) } });
  if (check.status === 429) return relayError(c, check);
  if (!check.ok) return c.json({ error: "Incorrect password." }, 403);
  await pool.query("DELETE FROM progress WHERE user_id = $1", [user.id]);
  await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [user.id]); // sessions & accounts cascade
  cache.delete(c.get("token"));
  return c.json({ ok: true });
});

// ---------- progress ----------
app.get("/progress", requireUser, async (c) => {
  const { rows } = await pool.query("SELECT data, version FROM progress WHERE user_id = $1", [c.get("user").id]);
  return c.json(rows[0] ? { data: rows[0].data, version: Number(rows[0].version) } : { data: null, version: 0 });
});

// Save progress. `version` is the version the client last read: if someone else saved since,
// nothing is written and the newer copy comes back (409) so the client can merge and retry.
app.put("/progress", requireUser, async (c) => {
  const text = await c.req.text();
  if (text.length > MAX_BYTES) return c.json({ error: "Progress data is too large." }, 413);
  let body: { data?: unknown; version?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return c.json({ error: "Invalid JSON." }, 400);
  }
  const { data } = body;
  const version = Number(body.version) || 0;
  if (!data || typeof data !== "object" || Array.isArray(data)) return c.json({ error: "data must be an object" }, 400);
  const userId = c.get("user").id;
  const json = JSON.stringify(data);
  const { rows } =
    version === 0
      ? await pool.query(
          "INSERT INTO progress (user_id, data, version) VALUES ($1, $2, 1) ON CONFLICT (user_id) DO NOTHING RETURNING version",
          [userId, json],
        )
      : await pool.query(
          "UPDATE progress SET data = $2, version = version + 1, updated_at = now() WHERE user_id = $1 AND version = $3 RETURNING version",
          [userId, json, version],
        );
  if (rows[0]) return c.json({ version: Number(rows[0].version) });
  const current = await pool.query("SELECT data, version FROM progress WHERE user_id = $1", [userId]);
  const row = current.rows[0];
  return c.json({ error: "conflict", data: row?.data ?? null, version: row ? Number(row.version) : 0 }, 409);
});

export default app;
