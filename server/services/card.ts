import { config } from '../config.ts';
import { q, tx, now, type Row } from '../db.ts';
import { bad, forbidden, HttpError, notFound } from '../errors.ts';
import { fromTambala, positiveMwk, str, toTambala } from '../money.ts';
import { SYS, post, userAcct } from '../ledger.ts';
import { decrypt, encrypt } from '../security.ts';
import { newCvv } from '../providers/cardIssuer.ts';
import { id, secLog, verifyPin } from './core.ts';
import { insertTx } from './wallet.ts';
import type { Ctx } from '../http.ts';

const GAMBLING_MCC = new Set(['7995', '7994', '7993', '7801', '7802']);

export const getCardRow = (userId: string): Row => {
  const c = q.get('SELECT * FROM cards WHERE user_id=?', userId);
  if (!c) throw new HttpError(404, 'NO_CARD', 'No card has been issued on this account');
  return c;
};

export function monthSpent(cardId: string): number {
  const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return (q.get(`SELECT COALESCE(SUM(amount_mwk),0) s FROM card_auths WHERE card_id=? AND status='APPROVED' AND created_at>=?`, cardId, start)!.s as number);
}

/** Full card details for the authenticated cardholder. Every view is logged; the UI offers an optional privacy mask. */
export function details(c: Ctx) {
  const card = getCardRow(c.user!.id);
  if (card.status === 'TERMINATED') throw forbidden('This card is closed');
  secLog(c.user!.id, 'Card details viewed', 'SUCCESS', c);
  return { cardNumber: decrypt(card.pan_enc, config.encKey), cvv: decrypt(card.cvv_enc, config.encKey), expiryMonth: card.exp_month, expiryYear: card.exp_year };
}

export async function rotateCvv(c: Ctx) {
  await verifyPin(c.user!, c.body.pin, c);
  const card = getCardRow(c.user!.id); const cvv = newCvv();
  q.run('UPDATE cards SET cvv_enc=? WHERE id=?', encrypt(cvv, config.encKey), card.id);
  secLog(c.user!.id, 'Card CVV regenerated', 'SUCCESS', c);
  return { cvv };
}

export function setFrozen(c: Ctx) {
  const card = getCardRow(c.user!.id);
  if (card.status === 'TERMINATED') throw forbidden('This card is closed');
  const frozen = c.body.frozen === true;
  q.run('UPDATE cards SET status=? WHERE id=?', frozen ? 'FROZEN' : 'ACTIVE', card.id);
  secLog(c.user!.id, frozen ? 'Card frozen' : 'Card unfrozen', frozen ? 'FLAGGED' : 'SUCCESS', c);
}

export function updateControls(c: Ctx) {
  const card = getCardRow(c.user!.id); const b = c.body; const sets: string[] = []; const vals: any[] = [];
  if (b.monthlySpendLimitMWK !== undefined) {
    const lim = positiveMwk(b.monthlySpendLimitMWK, 'monthlySpendLimitMWK');
    if (lim > config.tierLimits[c.user!.kyc_tier].monthly * 100) throw forbidden('Limit exceeds your KYC tier allowance', 'TIER_LIMIT');
    sets.push('monthly_limit=?'); vals.push(lim);
  }
  for (const [k, col] of [['allowInternational', 'allow_intl'], ['allowOnlineGambling', 'allow_gambling'], ['isBurnerMode', 'burner']] as const)
    if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') throw bad(`${k} must be true/false`); sets.push(`${col}=?`); vals.push(b[k] ? 1 : 0); }
  if (!sets.length) throw bad('Nothing to update');
  q.run(`UPDATE cards SET ${sets.join(', ')} WHERE id=?`, ...vals, card.id);
  secLog(c.user!.id, 'Card controls updated', 'SUCCESS', c);
}

export interface AuthReq { merchant: string; mcc?: string; country?: string; amountMWK: number; usd?: number }
/** Real-time authorization. Called by the issuer webhook in production, or /api/card/simulate-purchase in sandbox. */
export function authorize(userId: string, r: AuthReq): { approved: boolean; reason?: string; transactionId: string } {
  return tx(() => {
    const card = getCardRow(userId); const u = q.get('SELECT kyc_tier FROM users WHERE id=?', userId)!;
    const amount = toTambala(r.amountMWK); const country = (r.country ?? 'MW').toUpperCase();
    let decline: string | undefined;
    if (u.kyc_tier < 2) decline = 'Card not yet activated (KYC required)';
    else if (card.status !== 'ACTIVE') decline = 'Card is frozen';
    else if (country !== 'MW' && !card.allow_intl) decline = 'International payments are switched off';
    else if (r.mcc && GAMBLING_MCC.has(r.mcc) && !card.allow_gambling) decline = 'Online gambling is blocked';
    else if (monthSpent(card.id) + amount > card.monthly_limit) decline = 'Monthly spend limit reached';
    const authId = id('auth'); const txId = id('tx');
    if (!decline) {
      try { post(txId, [{ account: userAcct(userId), asset: 'MWK', amount: -amount }, { account: SYS.cardSettle, asset: 'MWK', amount }]); }
      catch (e) { if (e instanceof HttpError && e.code === 'INSUFFICIENT_FUNDS') decline = 'Insufficient balance'; else throw e; }
    }
    q.run('INSERT INTO card_auths (id,card_id,merchant,mcc,country,amount_mwk,usd,status,decline_reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      authId, card.id, r.merchant, r.mcc ?? null, country, amount, r.usd ?? null, decline ? 'DECLINED' : 'APPROVED', decline ?? null, now());
    insertTx({ id: txId, userId, type: 'CARD_PAYMENT', title: r.merchant, description: decline ? `Declined: ${decline}` : `Virtual Visa payment${r.usd ? ` (USD ${r.usd.toFixed(2)} billed in MWK)` : ''}`,
      channel: 'VIRTUAL_CARD', status: decline ? 'FAILED' : 'COMPLETED', amount, direction: 'OUTGOING', reference: authId, counterparty: r.merchant, usd: r.usd });
    if (!decline && card.burner) q.run('UPDATE cards SET cvv_enc=? WHERE id=?', encrypt(newCvv(), config.encKey), card.id); // burner mode: CVV single-use
    if (decline) secLog(userId, `Card payment declined at ${r.merchant}: ${decline}`, 'BLOCKED');
    return { approved: !decline, reason: decline, transactionId: txId };
  });
}

export function simulatePurchase(c: Ctx) {
  if (config.providerMode !== 'sandbox') throw notFound();
  const b = c.body; const amount = fromTambala(positiveMwk(b.amountMWK));
  return authorize(c.user!.id, { merchant: str(b.merchant, 'merchant', 2, 60), mcc: b.mcc ? String(b.mcc) : undefined, country: b.country ? String(b.country) : 'MW', amountMWK: amount, usd: typeof b.usd === 'number' ? b.usd : undefined });
}
