import path from 'node:path';
import { createHash } from 'node:crypto';

const env = process.env;
export const NODE_ENV = env.NODE_ENV ?? 'development';
export const isProd = NODE_ENV === 'production';
export const isTest = NODE_ENV === 'test';

function secret(name: string, devDefault: string): string {
  const v = env[name];
  if (v && v.length >= 32) return v;
  if (isProd) throw new Error(`${name} must be set (min 32 chars) in production`);
  return devDefault;
}
const int = (n: string, d: number) => (env[n] ? parseInt(env[n]!, 10) : d);

const providerMode = (env.PROVIDER_MODE ?? 'sandbox') as 'sandbox' | 'live';
if (providerMode === 'sandbox' && isProd && env.ALLOW_SANDBOX_IN_PROD !== 'true') {
  throw new Error(
    'PROVIDER_MODE=sandbox in production would credit FAKE money. Set PROVIDER_MODE=live with real provider credentials, ' +
      'or ALLOW_SANDBOX_IN_PROD=true for a clearly-labelled staging deployment.'
  );
}

export const config = {
  port: int('PORT', 3000),
  appUrl: env.APP_URL ?? 'http://localhost:3000',
  dataDir: path.resolve(env.DATA_DIR ?? './data'),
  dbFile: env.DB_FILE ?? path.resolve(env.DATA_DIR ?? './data', 'nyasavault.db'),
  distDir: path.resolve(env.DIST_DIR ?? './dist'),
  providerMode,
  sandboxDelayMs: int('SANDBOX_DELAY_MS', 2500),
  sessionTtlHours: int('SESSION_TTL_HOURS', 24 * 7),
  // 32-byte key derived from CARD_ENC_KEY, used to encrypt PAN/CVV/TOTP secrets at rest
  encKey: createHash('sha256').update(secret('ENCRYPTION_KEY', 'dev-only-encryption-key-change-me-0123456789')).digest(),
  webhookSecret: secret('WEBHOOK_SECRET', 'dev-only-webhook-secret-change-me-0123456789'),
  adminApiKey: env.ADMIN_API_KEY && env.ADMIN_API_KEY.length >= 32 ? env.ADMIN_API_KEY : isProd ? '' : 'dev-admin-key-dev-admin-key-dev-admin-key',
  // FX + pricing
  usdMwkRate: parseFloat(env.USD_MWK_RATE ?? '1751'),
  cryptoSpreadBps: int('CRYPTO_SPREAD_BPS', 150),
  priceMaxStaleMs: int('PRICE_MAX_STALE_MS', 5 * 60_000),
  // KYC tier limits (MWK). Set according to your RBM licence / bank partner policy.
  tierLimits: {
    1: { daily: int('TIER1_DAILY_MWK', 150_000), monthly: int('TIER1_MONTHLY_MWK', 1_000_000) },
    2: { daily: int('TIER2_DAILY_MWK', 5_000_000), monthly: int('TIER2_MONTHLY_MWK', 50_000_000) },
    3: { daily: int('TIER3_DAILY_MWK', 20_000_000), monthly: int('TIER3_MONTHLY_MWK', 200_000_000) },
  } as Record<number, { daily: number; monthly: number }>,
  amlReportThresholdMwk: int('AML_REPORT_THRESHOLD_MWK', 5_000_000),
  p2pOrderTtlMinutes: int('P2P_ORDER_TTL_MINUTES', 15),
  // Airtel Money Open API
  airtel: {
    baseUrl: env.AIRTEL_BASE_URL ?? '',
    clientId: env.AIRTEL_CLIENT_ID ?? '',
    clientSecret: env.AIRTEL_CLIENT_SECRET ?? '',
  },
  // Shown in the footer ONLY if you set it, e.g. "Licensed by the Reserve Bank of Malawi, licence no. XXX". Never claim a licence you do not hold.
  licenceNotice: env.LICENCE_NOTICE ?? '',
  emailWebhookUrl: env.EMAIL_WEBHOOK_URL ?? '',
  trustProxy: env.TRUST_PROXY === "true",
  tnm: { baseUrl: env.TNM_BASE_URL ?? '', apiKey: env.TNM_API_KEY ?? '' },
};
