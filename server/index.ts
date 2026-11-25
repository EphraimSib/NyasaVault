import { config, isProd } from './config.ts';
import { createApp } from './app.ts';
import { db } from './db.ts';

if (!isProd) console.log('[dev] using development secrets; set ENCRYPTION_KEY / WEBHOOK_SECRET / ADMIN_API_KEY for production');
if (config.providerMode === 'sandbox') console.warn('\n  ⚠  SANDBOX MODE: no real money moves. Deposits/withdrawals/cards are simulated.\n');
if (isProd && !config.adminApiKey) console.warn('[warn] ADMIN_API_KEY not set: admin endpoints (KYC review, disputes) are disabled');

const server = createApp();
server.listen(config.port, '0.0.0.0', () => console.log(`NyasaVault listening on :${config.port} (${config.providerMode})`));

function shutdown(sig: string) {
  console.log(`${sig} received, shutting down`);
  server.close(() => { try { db.close(); } catch {} process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
