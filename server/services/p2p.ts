import { config } from '../config.ts';
import { q, tx, now, type Row } from '../db.ts';
import { bad, conflict, forbidden, notFound } from '../errors.ts';
import { fromTambala, fromUnits, positiveMwk, str, toTambala, toUnits } from '../money.ts';
import { balanceOf, escrowAcct, post, userAcct } from '../ledger.ts';
import { isChannel } from '../providers/mobileMoney.ts';
import { quote } from '../providers/market.ts';
import { audit, id, requireTier, secLog, verifyPin } from './core.ts';
import { insertTx } from './wallet.ts';
import type { Ctx } from '../http.ts';

const P2P_ASSETS = ['USDT', 'BTC', 'USDC'];
const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
const sys = (orderId: string, text: string) => q.run('INSERT INTO p2p_messages (order_id, sender_id, text, created_at) VALUES (?,?,?,?)', orderId, null, text, now());

// ---------- offers ----------
export function listOffers(c: Ctx) {
  const type = c.url.searchParams.get('type'); const asset = c.url.searchParams.get('asset');
  const rows = q.all(`SELECT o.*, u.full_name, u.id uid, u.telco,
      (SELECT COUNT(*) FROM p2p_orders WHERE status='COMPLETED' AND (buyer_id=u.id OR seller_id=u.id)) done,
      (SELECT COUNT(*) FROM p2p_orders WHERE status='DISPUTED' AND (buyer_id=u.id OR seller_id=u.id)) disputed,
      (SELECT MAX(last_seen_at) FROM sessions WHERE user_id=u.id AND revoked_at IS NULL) seen
    FROM p2p_offers o JOIN users u ON u.id=o.user_id WHERE o.status='ACTIVE' AND o.remaining_units>0
      AND (? IS NULL OR o.type=?) AND (? IS NULL OR o.asset=?) ORDER BY o.price_mwk ${type === 'BUY' ? 'DESC' : 'ASC'} LIMIT 100`, type, type, asset, asset);
  return rows.map((o) => ({
    id: o.id, userId: o.uid, userName: shortName(o.full_name), userRating: o.done + o.disputed === 0 ? 100 : +((o.done / (o.done + o.disputed)) * 100).toFixed(1),
    tradesCount: o.done, type: o.type, cryptoSymbol: o.asset, priceMWK: fromTambala(o.price_mwk), availableCrypto: fromUnits(o.remaining_units),
    minLimitMWK: fromTambala(o.min_mwk), maxLimitMWK: fromTambala(o.max_mwk), paymentMethods: JSON.parse(o.payment_methods), paymentDetails: o.payment_details,
    isOnline: !!o.seen && now() - o.seen < 5 * 60_000, autoEscrowEnabled: true, isMine: o.uid === c.user!.id,
  }));
}

export async function createOffer(c: Ctx) {
  const u = c.user!; const b = c.body; requireTier(u, 2, 'Posting P2P offers');
  if (b.type !== 'BUY' && b.type !== 'SELL') throw bad('type must be BUY or SELL');
  if (!P2P_ASSETS.includes(b.cryptoSymbol)) throw bad('Unsupported asset');
  const price = positiveMwk(b.priceMWK, 'priceMWK'); const units = toUnits(Number(b.amountCrypto)); const min = positiveMwk(b.minLimitMWK, 'minLimitMWK'); const max = positiveMwk(b.maxLimitMWK, 'maxLimitMWK');
  if (!(units > 0)) throw bad('amountCrypto must be positive'); if (min > max) throw bad('Minimum limit cannot exceed maximum');
  const methods = Array.isArray(b.paymentMethods) ? b.paymentMethods.filter(isChannel) : []; if (!methods.length) throw bad('Choose at least one payment method');
  const details = str(b.paymentDetails, 'Payment details', 5, 300);
  const mid = (await quote(b.cryptoSymbol)).midMWK;
  if (Math.abs(fromTambala(price) - mid) / mid > 0.15) throw bad(`Price must be within 15% of the market rate (MWK ${Math.round(mid).toLocaleString('en-US')})`, 'PRICE_OFF_MARKET');
  if (b.type === 'SELL' && balanceOf(userAcct(u.id), b.cryptoSymbol) < units) throw bad(`You need at least ${fromUnits(units)} ${b.cryptoSymbol} available to post this offer`, 'INSUFFICIENT_FUNDS');
  if ((q.get(`SELECT COUNT(*) n FROM p2p_offers WHERE user_id=? AND status='ACTIVE'`, u.id)!.n as number) >= 10) throw conflict('You can have at most 10 active offers');
  const oid = id('off');
  q.run('INSERT INTO p2p_offers (id,user_id,type,asset,price_mwk,remaining_units,min_mwk,max_mwk,payment_methods,payment_details,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', oid, u.id, b.type, b.cryptoSymbol, price, units, min, max, JSON.stringify(methods), details, now());
  return { id: oid };
}
export function closeOffer(c: Ctx) {
  const r = q.run(`UPDATE p2p_offers SET status='CLOSED' WHERE id=? AND user_id=? AND status='ACTIVE'`, c.params.id, c.user!.id);
  if (!r.changes) throw notFound('Offer not found');
}

// ---------- orders ----------
function mustOrder(orderId: string, userId: string): Row {
  const o = q.get('SELECT * FROM p2p_orders WHERE id=?', orderId);
  if (!o || (o.buyer_id !== userId && o.seller_id !== userId)) throw notFound('Order not found'); return o;
}
export async function createOrder(c: Ctx) {
  const u = c.user!; const b = c.body; requireTier(u, 2, 'P2P trading');
  const offer = q.get(`SELECT * FROM p2p_offers WHERE id=? AND status='ACTIVE'`, String(b.offerId)); if (!offer) throw notFound('Offer is no longer available');
  if (offer.user_id === u.id) throw bad('You cannot trade with your own offer');
  const method = String(b.method); if (!JSON.parse(offer.payment_methods).includes(method)) throw bad('Payment method not accepted by this offer');
  const total = positiveMwk(b.amountMWK);
  if (total < offer.min_mwk || total > offer.max_mwk) throw bad(`Amount must be between MWK ${fromTambala(offer.min_mwk).toLocaleString('en-US')} and ${fromTambala(offer.max_mwk).toLocaleString('en-US')}`);
  const units = Math.floor((fromTambala(total) / fromTambala(offer.price_mwk)) * 1e8); if (units <= 0) throw bad('Amount too small');
  const makerIsSeller = offer.type === 'SELL'; const sellerId = makerIsSeller ? offer.user_id : u.id; const buyerId = makerIsSeller ? u.id : offer.user_id;
  let sellerDetails = offer.payment_details;
  if (!makerIsSeller) sellerDetails = str(b.paymentDetails, 'Your payment details (where the buyer should pay you)', 5, 300);
  const oid = id('ord'); const expires = now() + config.p2pOrderTtlMinutes * 60_000;
  tx(() => {
    const fresh = q.get('SELECT remaining_units, status FROM p2p_offers WHERE id=?', offer.id)!;
    if (fresh.status !== 'ACTIVE' || fresh.remaining_units < units) throw conflict('Not enough crypto left on this offer', 'OFFER_DEPLETED');
    post(`${oid}:lock`, [{ account: userAcct(sellerId), asset: offer.asset, amount: -units }, { account: escrowAcct(oid), asset: offer.asset, amount: units }]);
    q.run('UPDATE p2p_offers SET remaining_units = remaining_units - ? WHERE id=?', units, offer.id);
    q.run(`INSERT INTO p2p_orders (id,offer_id,buyer_id,seller_id,asset,units,price_mwk,total_mwk,method,status,seller_payment_details,expires_at,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, oid, offer.id, buyerId, sellerId, offer.asset, units, offer.price_mwk, total, method, 'PENDING_PAYMENT', sellerDetails, expires, now(), now());
    sys(oid, `NyasaVault Escrow locked ${fromUnits(units)} ${offer.asset}. The buyer has ${config.p2pOrderTtlMinutes} minutes to pay MWK ${fromTambala(total).toLocaleString('en-US')} directly to the seller, then mark the order as paid.`);
    secLog(u.id, `P2P order opened (${offer.asset})`, 'SUCCESS', c);
  });
  return orderView(q.get('SELECT * FROM p2p_orders WHERE id=?', oid)!, u.id);
}

export function orderView(o: Row, viewerId: string) {
  const isBuyer = o.buyer_id === viewerId; const other = q.get('SELECT full_name FROM users WHERE id=?', isBuyer ? o.seller_id : o.buyer_id)!;
  const msgs = q.all('SELECT * FROM p2p_messages WHERE order_id=? ORDER BY id', o.id).map((m) => ({
    id: String(m.id), sender: m.sender_id === null ? 'SYSTEM' : m.sender_id === viewerId ? 'YOU' : 'COUNTERPARTY', text: m.text, timestamp: new Date(m.created_at).toISOString() }));
  return {
    id: o.id, offerId: o.offer_id, role: isBuyer ? 'BUYER' : 'SELLER', type: isBuyer ? 'BUY' : 'SELL', cryptoSymbol: o.asset, cryptoAmount: fromUnits(o.units), totalMWK: fromTambala(o.total_mwk),
    priceMWK: fromTambala(o.price_mwk), counterpartyName: shortName(other.full_name), counterpartyRating: 100, paymentMethod: o.method, sellerPaymentAccount: o.seller_payment_details,
    status: o.status, createdAt: new Date(o.created_at).toISOString(), expiresAt: new Date(o.expires_at).toISOString(), expiresInSeconds: Math.max(0, Math.round((o.expires_at - now()) / 1000)),
    escrowLocked: ['PENDING_PAYMENT', 'PAYMENT_SENT', 'DISPUTED'].includes(o.status), paymentProofReference: o.payment_ref ?? undefined, chatMessages: msgs,
  };
}
export const myOrders = (c: Ctx) => q.all('SELECT * FROM p2p_orders WHERE buyer_id=? OR seller_id=? ORDER BY created_at DESC LIMIT 30', c.user!.id, c.user!.id).map((o) => orderView(o, c.user!.id));
export const getOrder = (c: Ctx) => orderView(mustOrder(c.params.id, c.user!.id), c.user!.id);

export function markPaid(c: Ctx) {
  const o = mustOrder(c.params.id, c.user!.id); if (o.buyer_id !== c.user!.id) throw forbidden('Only the buyer can mark an order as paid');
  if (o.status !== 'PENDING_PAYMENT') throw conflict('This order is not awaiting payment');
  if (o.expires_at < now()) throw conflict('This order has expired', 'ORDER_EXPIRED');
  const ref = str(c.body.reference, 'Payment reference', 4, 40);
  q.run(`UPDATE p2p_orders SET status='PAYMENT_SENT', payment_ref=?, updated_at=? WHERE id=?`, ref, now(), o.id);
  sys(o.id, `Buyer reports payment sent (ref ${ref}). Seller: check your mobile money / bank SMS, then release the crypto. Never release before you see the money.`);
}

export async function release(c: Ctx) {
  const o = mustOrder(c.params.id, c.user!.id); if (o.seller_id !== c.user!.id) throw forbidden('Only the seller can release escrow');
  await verifyPin(c.user!, c.body.pin, c);
  completeOrder(o.id, 'seller');
}
function completeOrder(orderId: string, by: string) {
  tx(() => {
    const o = q.get('SELECT * FROM p2p_orders WHERE id=?', orderId)!;
    if (o.status !== 'PAYMENT_SENT' && o.status !== 'DISPUTED') throw conflict('Order is not ready for release');
    post(`${o.id}:release`, [{ account: escrowAcct(o.id), asset: o.asset, amount: -o.units }, { account: userAcct(o.buyer_id), asset: o.asset, amount: o.units }]);
    q.run(`UPDATE p2p_orders SET status='COMPLETED', updated_at=? WHERE id=?`, now(), o.id);
    sys(o.id, `Trade complete. ${fromUnits(o.units)} ${o.asset} released to the buyer (${by}).`);
    const common = { type: 'P2P_TRANSFER', channel: 'P2P_ESCROW', status: 'COMPLETED', amount: o.total_mwk, reference: o.id } as const;
    insertTx({ ...common, userId: o.buyer_id, title: `P2P Trade: Bought ${fromUnits(o.units)} ${o.asset}`, description: `Paid MWK ${fromTambala(o.total_mwk).toLocaleString('en-US')} off-platform via ${o.method}`, direction: 'OUTGOING', counterparty: 'Verified P2P seller' });
    insertTx({ ...common, userId: o.seller_id, title: `P2P Trade: Sold ${fromUnits(o.units)} ${o.asset}`, description: `Received MWK ${fromTambala(o.total_mwk).toLocaleString('en-US')} off-platform via ${o.method}`, direction: 'INCOMING', counterparty: 'Verified P2P buyer' });
    secLog(o.seller_id, 'P2P escrow released', 'SUCCESS');
  });
}
function refundOrder(orderId: string, why: string) {
  tx(() => {
    const o = q.get('SELECT * FROM p2p_orders WHERE id=?', orderId)!;
    if (!['PENDING_PAYMENT', 'DISPUTED'].includes(o.status)) throw conflict('Order cannot be cancelled now');
    post(`${o.id}:refund`, [{ account: escrowAcct(o.id), asset: o.asset, amount: -o.units }, { account: userAcct(o.seller_id), asset: o.asset, amount: o.units }]);
    q.run(`UPDATE p2p_orders SET status='CANCELLED', updated_at=? WHERE id=?`, now(), o.id);
    q.run(`UPDATE p2p_offers SET remaining_units = remaining_units + ? WHERE id=? AND status='ACTIVE'`, o.units, o.offer_id);
    sys(o.id, `Order cancelled (${why}). Escrow returned to the seller.`);
  });
}
export function cancel(c: Ctx) {
  const o = mustOrder(c.params.id, c.user!.id);
  if (o.status === 'PAYMENT_SENT') throw conflict('Payment was already reported. Open a dispute instead.');
  if (o.buyer_id !== c.user!.id && o.expires_at > now()) throw forbidden('Only the buyer can cancel before the order expires');
  refundOrder(o.id, o.buyer_id === c.user!.id ? 'cancelled by buyer' : 'expired');
}
export function dispute(c: Ctx) {
  const o = mustOrder(c.params.id, c.user!.id); if (o.status !== 'PAYMENT_SENT') throw conflict('Only orders marked as paid can be disputed');
  const reason = str(c.body.reason, 'Reason', 5, 500);
  q.run(`UPDATE p2p_orders SET status='DISPUTED', dispute_reason=?, updated_at=? WHERE id=?`, reason, now(), o.id);
  sys(o.id, `A dispute was opened. Escrow stays locked until NyasaVault support reviews the evidence.`); audit(c.user!.id, 'p2p.dispute', o.id, { reason });
}
export function postMessage(c: Ctx) {
  const o = mustOrder(c.params.id, c.user!.id); const text = str(c.body.text, 'Message', 1, 500);
  if (['COMPLETED', 'CANCELLED'].includes(o.status)) throw conflict('This order is closed');
  q.run('INSERT INTO p2p_messages (order_id, sender_id, text, created_at) VALUES (?,?,?,?)', o.id, c.user!.id, text, now());
}
export function adminResolve(orderId: string, action: 'RELEASE' | 'REFUND') {
  if (!q.get(`SELECT 1 x FROM p2p_orders WHERE id=? AND status='DISPUTED'`, orderId)) throw notFound('No disputed order with that id');
  audit('admin', `p2p.resolve.${action}`, orderId);
  if (action === 'RELEASE') completeOrder(orderId, 'support'); else refundOrder(orderId, 'resolved by support');
}
/** Background: auto-cancel unpaid orders, escalate stale "paid" orders to a dispute so a human reviews them. */
export function sweepOrders() {
  for (const o of q.all(`SELECT id FROM p2p_orders WHERE status='PENDING_PAYMENT' AND expires_at < ?`, now())) { try { refundOrder(o.id, 'payment window expired'); } catch {} }
  for (const o of q.all(`SELECT id FROM p2p_orders WHERE status='PAYMENT_SENT' AND updated_at < ?`, now() - 60 * 60_000)) {
    q.run(`UPDATE p2p_orders SET status='DISPUTED', dispute_reason='Auto-escalated: seller did not respond within 60 minutes', updated_at=? WHERE id=?`, now(), o.id);
    sys(o.id, 'The seller has not released within 60 minutes. The order was escalated to NyasaVault support.');
  }
}
