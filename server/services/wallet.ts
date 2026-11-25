import { config } from '../config.ts';
import { q, tx, now, type Row } from '../db.ts';
import { bad, conflict, HttpError, notFound } from '../errors.ts';
import { fromTambala, positiveMwk, str, toTambala } from '../money.ts';
import { SYS, post, userAcct } from '../ledger.ts';
import { getProvider, isChannel, onProviderSettled, type Channel, type MmStatus } from '../providers/mobileMoney.ts';
import { calculateWithdrawalFee, MIN_DEPOSIT_MWK, MIN_WITHDRAWAL_MWK } from '../../shared/fees.ts';
import { MALAWI_BANKS } from '../../shared/banks.ts';
import { audit, checkLimits, id, normPhone, requireTier, secLog, validPhone, verifyPin } from './core.ts';
import type { Ctx } from '../http.ts';

const LABEL: Record<Channel, string> = { AIRTEL_MONEY: 'Airtel Money', TNM_MPAMBA: 'TNM Mpamba', BANK_TRANSFER: 'Bank' };

function getTx(userId: string, txId: string): Row {
  const r = q.get('SELECT * FROM transactions WHERE id=? AND user_id=?', txId, userId);
  if (!r) throw notFound('Transaction not found'); return r;
}
export function insertTx(o: { userId: string; type: string; title: string; description: string; channel: string; status: string; amount: number; fee?: number; direction: 'INCOMING' | 'OUTGOING'; reference: string; counterparty?: string; usd?: number; meta?: object; idem?: string; id?: string }): string {
  const txId = o.id ?? id('tx'); const t = now();
  q.run(`INSERT INTO transactions (id,user_id,type,title,description,channel,status,amount_mwk,fee_mwk,direction,reference,counterparty,equivalent_usd,meta,idempotency_key,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, txId, o.userId, o.type, o.title, o.description, o.channel, o.status, o.amount, o.fee ?? 0, o.direction, o.reference,
    o.counterparty ?? null, o.usd ?? null, o.meta ? JSON.stringify(o.meta) : null, o.idem ?? null, t, t);
  if (o.amount >= config.amlReportThresholdMwk * 100 && o.status !== 'FAILED') audit('system', 'aml.large_transaction', txId, { user: o.userId, type: o.type, amountMWK: fromTambala(o.amount) });
  return txId;
}

// ---------------- deposits ----------------
export async function startDeposit(c: Ctx) {
  const u = c.user!; const b = c.body;
  if (!isChannel(b.provider) || b.provider === 'BANK_TRANSFER') throw bad('Choose Airtel Money or TNM Mpamba');
  const channel = b.provider as Channel; const provider = getProvider(channel);
  if (!provider.canCollect) throw new HttpError(503, 'CHANNEL_UNAVAILABLE', `${LABEL[channel]} deposits are not available right now`);
  const amount = positiveMwk(b.amountMWK);
  if (fromTambala(amount) < MIN_DEPOSIT_MWK) throw bad(`Minimum deposit is MWK ${MIN_DEPOSIT_MWK.toLocaleString('en-US')}`);
  const phone = normPhone(str(b.phone, 'Phone', 8, 20)); if (!validPhone(phone)) throw bad('Phone must be a Malawi number like +265991234567');
  const idem = String(c.req.headers['idempotency-key'] ?? '').slice(0, 80) || undefined;
  if (idem) { const ex = q.get('SELECT id FROM transactions WHERE user_id=? AND idempotency_key=?', u.id, idem); if (ex) return getTx(u.id, ex.id); }
  const txId = tx(() => {
    checkLimits(u, amount);
    return insertTx({ userId: u.id, type: 'DEPOSIT', title: `${LABEL[channel]} Deposit`, description: `Approve the prompt on ${phone} to fund your wallet`, channel, status: 'PENDING', amount, direction: 'INCOMING', reference: 'PENDING', counterparty: `${LABEL[channel]} (${phone})`, meta: { phone }, idem });
  });
  try {
    const r = await provider.collect({ reference: txId, msisdn: phone, amountMWK: fromTambala(amount), narration: 'NyasaVault deposit' });
    q.run('UPDATE transactions SET reference=?, updated_at=? WHERE id=?', r.providerRef, now(), txId);
    if (r.status !== 'PENDING') settleCollection(txId, r.status, r.providerRef);
  } catch (e) {
    q.run(`UPDATE transactions SET status='FAILED', description=?, updated_at=? WHERE id=? AND status='PENDING'`, 'The payment request could not be sent', now(), txId);
    throw e;
  }
  return getTx(u.id, txId);
}

/** Idempotent: only a PENDING (or expired-then-paid) deposit can be settled, and only once. */
export function settleCollection(txId: string, status: MmStatus, providerRef: string) {
  if (status === 'PENDING') return;
  tx(() => {
    const t = q.get(`SELECT * FROM transactions WHERE id=? AND type='DEPOSIT'`, txId); if (!t) return;
    const expired = t.status === 'FAILED' && JSON.parse(t.meta ?? '{}').expired;
    if (t.status !== 'PENDING' && !(status === 'SUCCESS' && expired)) return;
    if (status === 'SUCCESS') {
      post(t.id, [{ account: SYS.float(t.channel), asset: 'MWK', amount: -t.amount_mwk }, { account: userAcct(t.user_id), asset: 'MWK', amount: t.amount_mwk }]);
      q.run(`UPDATE transactions SET status='COMPLETED', reference=?, description='Funds credited to your NyasaVault wallet', updated_at=? WHERE id=?`, providerRef, now(), t.id);
      secLog(t.user_id, `Deposit of MWK ${fromTambala(t.amount_mwk).toLocaleString('en-US')} via ${t.channel}`, 'SUCCESS');
    } else {
      q.run(`UPDATE transactions SET status='FAILED', description='Payment was declined or not approved', updated_at=? WHERE id=?`, now(), t.id);
    }
  });
}
onProviderSettled((ref, status, pref) => { try { settleCollection(ref, status, pref); } catch (e) { console.error('[settle]', e); } });

export async function handleWebhook(c: Ctx) {
  if (!isChannel(c.params.provider)) throw notFound('Unknown provider');
  const provider = getProvider(c.params.provider);
  if (!provider.verifyWebhook(c.req.headers, c.rawBody)) throw new HttpError(401, 'BAD_SIGNATURE', 'Invalid signature');
  const ev = provider.parseWebhook(c.body); if (!ev) throw bad('Unrecognised payload');
  const dup = q.get('SELECT 1 x FROM provider_events WHERE provider=? AND external_id=?', c.params.provider, `${ev.reference}:${ev.status}`);
  if (dup) return { ok: true };
  q.run('INSERT INTO provider_events (provider, external_id, payload, created_at) VALUES (?,?,?,?)', c.params.provider, `${ev.reference}:${ev.status}`, c.rawBody.slice(0, 5000), now());
  // Never trust the callback alone: confirm with the provider before moving money.
  const confirmed = await provider.status(ev.reference);
  settleCollection(ev.reference, confirmed, ev.providerRef);
  return { ok: true };
}

/** Background job: poll stuck deposits, expire abandoned ones, flag stuck withdrawals. */
export async function reconcile() {
  for (const t of q.all(`SELECT * FROM transactions WHERE type='DEPOSIT' AND status='PENDING' AND created_at < ?`, now() - 90_000)) {
    try {
      const s = await getProvider(t.channel).status(t.id);
      if (s !== 'PENDING') settleCollection(t.id, s, t.reference);
      else if (now() - t.created_at > 30 * 60_000) q.run(`UPDATE transactions SET status='FAILED', description='Payment request expired', meta=?, updated_at=? WHERE id=? AND status='PENDING'`, JSON.stringify({ ...JSON.parse(t.meta ?? '{}'), expired: true }), now(), t.id);
    } catch (e) { console.error('[reconcile]', t.id, (e as Error).message); }
  }
  for (const t of q.all(`SELECT id FROM transactions WHERE type='WITHDRAWAL' AND status='PROCESSING' AND created_at < ?`, now() - 15 * 60_000))
    audit('system', 'withdrawal.stuck', t.id);
}

// ---------------- withdrawals ----------------
export async function withdraw(c: Ctx) {
  const u = c.user!; const b = c.body;
  if (!isChannel(b.provider)) throw bad('Choose a withdrawal destination');
  const channel = b.provider as Channel; const provider = getProvider(channel);
  if (!provider.canDisburse) throw new HttpError(503, 'CHANNEL_UNAVAILABLE', `${LABEL[channel]} withdrawals are not available right now`);
  requireTier(u, 1, 'Withdrawals');
  const amount = positiveMwk(b.amountMWK);
  if (fromTambala(amount) < MIN_WITHDRAWAL_MWK) throw bad(`Minimum withdrawal is MWK ${MIN_WITHDRAWAL_MWK.toLocaleString('en-US')}`);
  const idem = String(c.req.headers['idempotency-key'] ?? '').slice(0, 80) || undefined;
  if (idem) { const ex = q.get('SELECT id FROM transactions WHERE user_id=? AND idempotency_key=?', u.id, idem); if (ex) return getTx(u.id, ex.id); }
  let dest: { phone?: string; bank?: { code: string; accountNumber: string; accountName: string } }; let destLabel: string;
  if (channel === 'BANK_TRANSFER') {
    const bank = MALAWI_BANKS.find((x) => x.id === b.bankId); if (!bank) throw bad('Choose a bank');
    const acct = String(b.accountNumber ?? '').replace(/\s/g, ''); if (!/^\d{6,20}$/.test(acct)) throw bad('Enter a valid account number');
    const name = str(b.accountName, 'Account name', 3, 80);
    dest = { bank: { code: bank.swiftCode, accountNumber: acct, accountName: name } }; destLabel = `${bank.shortName} ${acct} (${name})`;
  } else {
    const phone = normPhone(str(b.phone, 'Phone', 8, 20)); if (!validPhone(phone)) throw bad('Phone must be a Malawi number like +265991234567');
    dest = { phone }; destLabel = `${LABEL[channel]} ${phone}`;
  }
  await verifyPin(u, b.pin, c);
  const fee = calculateWithdrawalFee(fromTambala(amount), channel); const feeT = toTambala(fee.totalFee);
  const txId = tx(() => {
    checkLimits(u, amount);
    const tid = insertTx({ userId: u.id, type: 'WITHDRAWAL', title: `Withdrawal to ${channel === 'BANK_TRANSFER' ? 'Malawi Bank' : 'Mobile Money'}`, description: `Sending to ${destLabel}`, channel, status: 'PROCESSING', amount, fee: feeT, direction: 'OUTGOING', reference: 'PENDING', counterparty: destLabel, meta: dest, idem });
    post(tid, [{ account: userAcct(u.id), asset: 'MWK', amount: -(amount + feeT) }, { account: SYS.withdrawHold, asset: 'MWK', amount: amount + feeT }]);
    return tid;
  });
  try {
    const r = await provider.disburse({ reference: txId, amountMWK: fromTambala(amount), msisdn: dest.phone, bank: dest.bank });
    if (r.status === 'SUCCESS') finishWithdrawal(txId, true, r.providerRef);
    else if (r.status === 'FAILED') finishWithdrawal(txId, false, r.providerRef);
    else q.run('UPDATE transactions SET reference=? WHERE id=?', r.providerRef, txId); // stays PROCESSING; reconciled later
  } catch (e) {
    if (e instanceof HttpError) finishWithdrawal(txId, false, 'N/A'); // provider refused before sending: safe to reverse
    else audit('system', 'withdrawal.ambiguous', txId, { error: String(e) }); // outcome unknown: keep funds on hold for manual review
    throw e instanceof HttpError ? e : new HttpError(502, 'PROVIDER_ERROR', 'We could not confirm the transfer. Your funds are on hold while we check.');
  }
  return getTx(u.id, txId);
}
function finishWithdrawal(txId: string, ok: boolean, ref: string) {
  tx(() => {
    const t = q.get(`SELECT * FROM transactions WHERE id=? AND status='PROCESSING'`, txId); if (!t) return;
    const total = t.amount_mwk + t.fee_mwk;
    if (ok) {
      post(`${t.id}:done`, [{ account: SYS.withdrawHold, asset: 'MWK', amount: -total }, { account: SYS.float(t.channel), asset: 'MWK', amount: t.amount_mwk }, { account: SYS.fees, asset: 'MWK', amount: t.fee_mwk }]);
      q.run(`UPDATE transactions SET status='COMPLETED', reference=?, updated_at=? WHERE id=?`, ref, now(), t.id);
      secLog(t.user_id, `Withdrawal of MWK ${fromTambala(t.amount_mwk).toLocaleString('en-US')} to ${t.counterparty}`, 'SUCCESS');
    } else {
      post(`${t.id}:reverse`, [{ account: SYS.withdrawHold, asset: 'MWK', amount: -total }, { account: userAcct(t.user_id), asset: 'MWK', amount: total }]);
      q.run(`UPDATE transactions SET status='FAILED', description='Transfer failed. Funds returned to your wallet.', updated_at=? WHERE id=?`, now(), t.id);
    }
  });
}
export const getTransaction = (userId: string, txId: string) => getTx(userId, txId);
