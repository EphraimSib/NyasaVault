import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, isProd } from './config.ts';
import { handleApi, securityHeaders } from './http.ts';
import './routes.ts';
import { reconcile } from './services/wallet.ts';
import { sweepOrders } from './services/p2p.ts';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
  const root = config.distDir; let file = path.join(root, path.normalize(decodeURIComponent(pathname)));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); // SPA fallback
  if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Frontend not built. Run `npm run build`.'); }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

export function createApp() {
  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    const url = new URL(req.url ?? '/', 'http://x');
    if (await handleApi(req, res, url)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url.pathname);
  });
  const timers = [
    setInterval(() => reconcile().catch((e) => console.error('[reconcile]', e)), 60_000),
    setInterval(() => { try { sweepOrders(); } catch (e) { console.error('[sweep]', e); } }, 30_000),
  ];
  timers.forEach((t) => t.unref());
  server.on('close', () => timers.forEach(clearInterval));
  return server;
}
