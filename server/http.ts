import type { IncomingMessage, ServerResponse } from 'node:http';
import { config, isProd, isTest } from './config.ts';
import { HttpError, unauthorized, forbidden } from './errors.ts';
import { sha256, safeEqual } from './security.ts';
import { q, now, type Row } from './db.ts';

export interface Ctx {
  req: IncomingMessage; res: ServerResponse; url: URL; params: Record<string, string>;
  body: any; rawBody: string; ip: string; ua: string; user?: Row; sessionHash?: string;
}
type Handler = (c: Ctx) => unknown | Promise<unknown>;
interface Route { method: string; re: RegExp; keys: string[]; auth: 'none' | 'user' | 'admin'; limit: 'auth' | 'default'; maxBody: number; handler: Handler }
const routes: Route[] = [];

export function route(method: string, pattern: string, opts: { auth?: Route['auth']; limit?: Route['limit']; maxBody?: number }, handler: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, auth: opts.auth ?? 'user', limit: opts.limit ?? 'default', maxBody: opts.maxBody ?? 100_000, handler });
}

// ---- in-memory sliding-window rate limiter (single instance; use Redis if you scale out) ----
const hits = new Map<string, number[]>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const t = Date.now();
  const arr = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
  arr.push(t); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (!v.some((x) => t - x < 120_000)) hits.delete(k); }, 60_000).unref();

export const clientIp = (req: IncomingMessage) =>
  (config.trustProxy && (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > max) { reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function parseCookies(h?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of (h ?? '').split(';')) { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return out;
}
export const SESSION_COOKIE = 'nv_session';
export function setSessionCookie(res: ServerResponse, token: string, maxAgeSec: number) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isProd ? '; Secure' : ''}`);
}

export function securityHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

export function send(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const method = req.method ?? 'GET';
  let matched: Route | undefined; let params: Record<string, string> = {};
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(url.pathname);
    if (m) { matched = r; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; }
  }
  if (!matched) { if (url.pathname.startsWith('/api/')) { send(res, 404, { error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }); return true; } return false; }

  const ip = clientIp(req); const ua = String(req.headers['user-agent'] ?? '').slice(0, 200);
  try {
    if (rateLimited(`${matched.limit}:${ip}`, (matched.limit === 'auth' ? 10 : 300) * (isTest ? 1000 : 1), 60_000))
      throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.');

    if (method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && new URL(config.appUrl).origin !== origin && !url.pathname.startsWith('/api/webhooks/'))
        throw forbidden('Cross-origin request blocked', 'BAD_ORIGIN');
    }
    const rawBody = method === 'GET' || method === 'DELETE' ? '' : await readBody(req, matched.maxBody);
    let body: any = {};
    if (rawBody) { try { body = JSON.parse(rawBody); } catch { throw new HttpError(400, 'BAD_JSON', 'Body must be valid JSON'); } }
    const ctx: Ctx = { req, res, url, params, body, rawBody, ip, ua };

    if (matched.auth === 'user') authenticate(ctx);
    if (matched.auth === 'admin') {
      const key = String(req.headers['x-admin-key'] ?? '');
      if (!config.adminApiKey || !safeEqual(key, config.adminApiKey)) {
        if (rateLimited(`adminfail:${ip}`, 5, 15 * 60_000)) throw new HttpError(429, 'RATE_LIMITED', 'Too many failed admin attempts');
        throw unauthorized('Admin key required');
      }
    }
    const data = await matched.handler(ctx);
    if (!res.writableEnded) send(res, 200, { data: data ?? { ok: true } });
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { error: { code: e.code, message: e.message } });
    else { console.error('[error]', method, url.pathname, e); send(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong' } }); }
  }
  return true;
}

function authenticate(ctx: Ctx) {
  const token = parseCookies(ctx.req.headers.cookie)[SESSION_COOKIE];
  if (!token) throw unauthorized();
  const h = sha256(token);
  const s = q.get('SELECT * FROM sessions WHERE id_hash=? AND revoked_at IS NULL AND expires_at > ?', h, now());
  if (!s) throw unauthorized('Session expired. Please sign in again.');
  const u = q.get('SELECT * FROM users WHERE id=?', s.user_id);
  if (!u || u.status !== 'ACTIVE') throw unauthorized('Account unavailable');
  if (now() - s.last_seen_at > 60_000) q.run('UPDATE sessions SET last_seen_at=? WHERE id_hash=?', now(), h);
  ctx.user = u; ctx.sessionHash = h;
}
