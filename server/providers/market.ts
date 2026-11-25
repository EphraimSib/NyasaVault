import { config } from '../config.ts';
import { HttpError } from '../errors.ts';

export const SYMBOLS = ['USDT', 'BTC', 'ETH', 'USDC', 'SOL'] as const;
export type Symbol = (typeof SYMBOLS)[number];
const CG: Record<Symbol, string> = { USDT: 'tether', BTC: 'bitcoin', ETH: 'ethereum', USDC: 'usd-coin', SOL: 'solana' };
const SEED: Record<Symbol, { usd: number; ch: number }> = { USDT: { usd: 1, ch: 0 }, BTC: { usd: 92450, ch: 0 }, ETH: { usd: 3320, ch: 0 }, USDC: { usd: 1, ch: 0 }, SOL: { usd: 188, ch: 0 } };

let cache: { at: number; usd: Record<Symbol, { usd: number; ch: number }>; fx: number } | null = null;

async function refresh() {
  if (cache && Date.now() - cache.at < 30_000) return;
  try {
    const ids = Object.values(CG).join(',');
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`coingecko ${r.status}`);
    const j: any = await r.json();
    const usd = {} as any;
    for (const s of SYMBOLS) usd[s] = { usd: j[CG[s]].usd, ch: j[CG[s]].usd_24h_change ?? 0 };
    cache = { at: Date.now(), usd, fx: config.usdMwkRate };
  } catch (e) {
    if (config.providerMode === 'sandbox' && !cache) cache = { at: Date.now() - 25_000, usd: SEED, fx: config.usdMwkRate }; // offline dev
    else if (!cache) throw new HttpError(503, 'PRICES_UNAVAILABLE', 'Live prices are unavailable right now');
  }
}

export interface Quote { symbol: Symbol; priceUSD: number; midMWK: number; buyMWK: number; sellMWK: number; change24h: number }
export async function quotes(): Promise<Quote[]> {
  await refresh();
  if (Date.now() - cache!.at > config.priceMaxStaleMs) throw new HttpError(503, 'PRICES_STALE', 'Prices are stale; trading is paused');
  const sp = config.cryptoSpreadBps / 10_000;
  return SYMBOLS.map((s) => {
    const { usd, ch } = cache!.usd[s]; const mid = usd * cache!.fx;
    return { symbol: s, priceUSD: usd, midMWK: mid, buyMWK: mid * (1 + sp), sellMWK: mid * (1 - sp), change24h: +ch.toFixed(2) };
  });
}
export async function quote(s: Symbol): Promise<Quote> { return (await quotes()).find((q) => q.symbol === s)!; }
export const isSymbol = (s: any): s is Symbol => (SYMBOLS as readonly string[]).includes(s);
export const NETWORKS: Record<Symbol, string> = { USDT: 'TRON (TRC20)', BTC: 'Bitcoin Native SegWit', ETH: 'Ethereum (ERC20)', USDC: 'Solana (SPL)', SOL: 'Solana Native' };
export const NAMES: Record<Symbol, string> = { USDT: 'Tether USD', BTC: 'Bitcoin', ETH: 'Ethereum', USDC: 'USD Coin', SOL: 'Solana' };
