import { randomBytes } from 'node:crypto';
import { config } from '../config.ts';
import { q, tx, now } from '../db.ts';
import { bad, conflict, forbidden, HttpError } from '../errors.ts';
import { fromTambala, fromUnits, positiveMwk, toTambala, toUnits } from '../money.ts';
import { SYS, balanceOf, post, userAcct } from '../ledger.ts';
import { NAMES, NETWORKS, SYMBOLS, isSymbol, quote, quotes, type Symbol } from '../providers/market.ts';
import { checkLimits, requireTier, secLog } from './core.ts';
import { insertTx } from './wallet.ts';
import type { Ctx } from '../http.ts';

const MAX_SLIPPAGE = 0.02;

export async function assets(userId: string) {
  const qs = await quotes();
  return qs.map((x) => ({
    symbol: x.symbol, name: NAMES[x.symbol], network: NETWORKS[x.symbol], priceUSD: x.priceUSD, priceMWK: Math.round(x.midMWK),
    buyPriceMWK: x.buyMWK, sellPriceMWK: x.sellMWK, change24h: x.change24h, userBalance: fromUnits(balanceOf(userAcct(userId), x.symbol)),
    depositAddress: depositAddress(userId, x.symbol),
  }));
}

/** Real addresses need a custody provider (Fireblocks, BitGo, Cobo, ...). Sandbox returns clearly-fake placeholders. */
function depositAddress(userId: string, symbol: Symbol): string | null {
  const ex = q.get('SELECT address FROM deposit_addresses WHERE user_id=? AND asset=?', userId, symbol);
  if (ex) return ex.address;
  if (config.providerMode !== 'sandbox') return null;
  const addr = `SANDBOX-${symbol}-${randomBytes(10).toString('hex')}`;
  q.run('INSERT INTO deposit_addresses (user_id, asset, network, address, sandbox) VALUES (?,?,?,?,1)', userId, symbol, NETWORKS[symbol], addr);
  return addr;
}

function checkQuoted(quoted: unknown, live: number) {
  if (typeof quoted !== 'number' || !(quoted > 0)) throw bad('quotedPriceMWK is required');
  if (Math.abs(quoted - live) / live > MAX_SLIPPAGE) throw new HttpError(409, 'PRICE_CHANGED', `Price moved to MWK ${Math.round(live).toLocaleString('en-US')}. Review and try again.`);
}

export async function buy(c: Ctx) {
  const u = c.user!; requireTier(u, 2, 'Buying crypto');
  if (!isSymbol(c.body.symbol)) throw bad('Unknown asset'); const sym = c.body.symbol;
  const mwk = positiveMwk(c.body.amountMWK); if (fromTambala(mwk) < 1000) throw bad('Minimum purchase is MWK 1,000');
  const qt = await quote(sym); checkQuoted(c.body.quotedPriceMWK, qt.buyMWK);
  const units = Math.floor((fromTambala(mwk) / qt.buyMWK) * 1e8);
  if (units <= 0) throw bad('Amount too small');
  return tx(() => {
    checkLimits(u, mwk);
    const txId = insertTx({ userId: u.id, type: 'CRYPTO_BUY', title: `Purchased ${fromUnits(units)} ${sym}`, description: `Spot order at MWK ${Math.round(qt.buyMWK).toLocaleString('en-US')} per ${sym} (spread included)`, channel: 'CRYPTO_DESK', status: 'COMPLETED', amount: mwk, direction: 'OUTGOING', reference: `SPOT-${sym}-${Date.now().toString(36).toUpperCase()}`, counterparty: 'NyasaVault Crypto Desk', usd: +(fromTambala(mwk) / config.usdMwkRate).toFixed(2), meta: { symbol: sym, units, price: qt.buyMWK } });
    post(txId, [{ account: userAcct(u.id), asset: 'MWK', amount: -mwk }, { account: SYS.desk, asset: 'MWK', amount: mwk }, { account: SYS.desk, asset: sym, amount: -units }, { account: userAcct(u.id), asset: sym, amount: units }]);
    return { transactionId: txId, symbol: sym, units: fromUnits(units), priceMWK: qt.buyMWK };
  });
}

export async function sell(c: Ctx) {
  const u = c.user!; requireTier(u, 2, 'Selling crypto');
  if (!isSymbol(c.body.symbol)) throw bad('Unknown asset'); const sym = c.body.symbol;
  if (typeof c.body.units !== 'number' || !(c.body.units > 0)) throw bad('units must be a positive number');
  const units = toUnits(c.body.units); const qt = await quote(sym); checkQuoted(c.body.quotedPriceMWK, qt.sellMWK);
  const mwk = Math.floor(fromUnits(units) * qt.sellMWK * 100); if (mwk < 100_00) throw bad('Minimum sale is MWK 100');
  return tx(() => {
    checkLimits(u, mwk);
    const txId = insertTx({ userId: u.id, type: 'CRYPTO_SELL', title: `Sold ${fromUnits(units)} ${sym}`, description: `Spot sale at MWK ${Math.round(qt.sellMWK).toLocaleString('en-US')} per ${sym} (spread included)`, channel: 'CRYPTO_DESK', status: 'COMPLETED', amount: mwk, direction: 'INCOMING', reference: `SPOT-SELL-${Date.now().toString(36).toUpperCase()}`, counterparty: 'NyasaVault Crypto Desk', usd: +(fromTambala(mwk) / config.usdMwkRate).toFixed(2), meta: { symbol: sym, units, price: qt.sellMWK } });
    post(txId, [{ account: userAcct(u.id), asset: sym, amount: -units }, { account: SYS.desk, asset: sym, amount: units }, { account: SYS.desk, asset: 'MWK', amount: -mwk }, { account: userAcct(u.id), asset: 'MWK', amount: mwk }]);
    return { transactionId: txId, symbol: sym, mwk: fromTambala(mwk), priceMWK: qt.sellMWK };
  });
}

/** Sandbox only: credit test coins so P2P and selling can be exercised without a custody provider. */
export function sandboxFaucet(c: Ctx) {
  if (config.providerMode !== 'sandbox') throw new HttpError(404, 'NOT_FOUND', 'Not found');
  if (!isSymbol(c.body.symbol)) throw bad('Unknown asset');
  const units = toUnits(Math.min(Number(c.body.units) || 100, 1000));
  tx(() => { const id = `faucet_${Date.now()}_${randomBytes(3).toString('hex')}`; post(id, [{ account: 's:faucet', asset: c.body.symbol, amount: -units }, { account: userAcct(c.user!.id), asset: c.body.symbol, amount: units }]); });
  secLog(c.user!.id, `Sandbox faucet: ${c.body.symbol}`, 'SUCCESS', c);
}
