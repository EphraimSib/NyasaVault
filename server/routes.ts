import fs from 'node:fs';
import { route } from './http.ts';
import { q, now } from './db.ts';
import { bad, notFound } from './errors.ts';
import { verifyLedger } from './ledger.ts';
import { config } from './config.ts';
import * as core from './services/core.ts';
import * as wallet from './services/wallet.ts';
import * as card from './services/card.ts';
import * as crypto from './services/crypto.ts';
import * as p2p from './services/p2p.ts';
import { adminHtml, adminJs } from './adminPage.ts';
import { bootstrap, publicConfig, userView, listTransactions, txView } from './views.ts';

// ---- public ----
route('GET', '/api/health', { auth: 'none' }, () => { q.get('SELECT 1'); return { status: 'ok', mode: config.providerMode, time: now() }; });
route('GET', '/api/config', { auth: 'none' }, () => publicConfig());
route('POST', '/api/auth/register', { auth: 'none', limit: 'auth' }, async (c) => { const r = await core.register(c); return userView(q.get('SELECT * FROM users WHERE id=?', r.userId)!); });
route('POST', '/api/auth/login', { auth: 'none', limit: 'auth' }, async (c) => { const r = await core.login(c); return userView(q.get('SELECT * FROM users WHERE id=?', r.userId)!); });
route('POST', '/api/webhooks/mobile-money/:provider', { auth: 'none', maxBody: 50_000 }, (c) => wallet.handleWebhook(c));

// ---- session / account ----
route('POST', '/api/auth/forgot', { auth: 'none', limit: 'auth' }, (c) => core.forgotPassword(c));
route('POST', '/api/auth/reset', { auth: 'none', limit: 'auth' }, (c) => core.resetPassword(c));
route('POST', '/api/auth/logout', {}, (c) => core.logout(c));
route('GET', '/api/state', {}, (c) => bootstrap(c));
route('GET', '/api/me', {}, (c) => userView(c.user!));
route('POST', '/api/auth/change-password', { limit: 'auth' }, (c) => core.changePassword(c));
route('POST', '/api/pin/change', { limit: 'auth' }, (c) => core.changePin(c));
route('POST', '/api/2fa/setup', {}, (c) => core.totpSetup(c));
route('POST', '/api/2fa/enable', { limit: 'auth' }, (c) => core.totpEnable(c));
route('POST', '/api/2fa/disable', { limit: 'auth' }, (c) => core.totpDisable(c));
route('GET', '/api/sessions', {}, (c) => core.listSessions(c));
route('DELETE', '/api/sessions/:id', {}, (c) => core.revokeSession(c));
route('POST', '/api/sessions/revoke-others', {}, (c) => core.revokeOthers(c));

// ---- KYC ----
route('POST', '/api/kyc/submit', { maxBody: 12_000_000 }, (c) => core.submitKyc(c));

// ---- money ----
route('GET', '/api/transactions', {}, (c) => listTransactions(c.user!.id, Math.min(parseInt(c.url.searchParams.get('limit') ?? '100', 10) || 100, 500)));
route('GET', '/api/transactions/:id', {}, (c) => txView(wallet.getTransaction(c.user!.id, c.params.id)));
route('POST', '/api/wallet/deposit', {}, async (c) => txView(await wallet.startDeposit(c)));
route('POST', '/api/wallet/withdraw', {}, async (c) => txView(await wallet.withdraw(c)));

// ---- card ----
route('GET', '/api/card/details', {}, (c) => card.details(c));
route('POST', '/api/card/rotate-cvv', { limit: 'auth' }, (c) => card.rotateCvv(c));
route('POST', '/api/card/freeze', {}, (c) => card.setFrozen(c));
route('PATCH', '/api/card/controls', {}, (c) => card.updateControls(c));
route('POST', '/api/card/simulate-purchase', {}, (c) => card.simulatePurchase(c));

// ---- crypto ----
route('GET', '/api/crypto/assets', {}, (c) => crypto.assets(c.user!.id));
route('POST', '/api/crypto/buy', {}, (c) => crypto.buy(c));
route('POST', '/api/crypto/sell', {}, (c) => crypto.sell(c));
route('POST', '/api/crypto/sandbox-faucet', {}, (c) => crypto.sandboxFaucet(c));

// ---- P2P ----
route('GET', '/api/p2p/offers', {}, (c) => p2p.listOffers(c));
route('POST', '/api/p2p/offers', {}, (c) => p2p.createOffer(c));
route('DELETE', '/api/p2p/offers/:id', {}, (c) => p2p.closeOffer(c));
route('GET', '/api/p2p/orders', {}, (c) => p2p.myOrders(c));
route('POST', '/api/p2p/orders', {}, (c) => p2p.createOrder(c));
route('GET', '/api/p2p/orders/:id', {}, (c) => p2p.getOrder(c));
route('POST', '/api/p2p/orders/:id/paid', {}, (c) => p2p.markPaid(c));
route('POST', '/api/p2p/orders/:id/release', { limit: 'auth' }, (c) => p2p.release(c));
route('POST', '/api/p2p/orders/:id/cancel', {}, (c) => p2p.cancel(c));
route('POST', '/api/p2p/orders/:id/dispute', {}, (c) => p2p.dispute(c));
route('POST', '/api/p2p/orders/:id/messages', {}, (c) => p2p.postMessage(c));

// ---- admin (x-admin-key header) ----
route('GET', '/api/admin/kyc', { auth: 'admin' }, (c) => q.all(`SELECT id, full_name, email, phone, id_type, national_id, nationality, dob, district, address, tax_number, occupation, source_of_funds, is_pep, kyc_status FROM users WHERE kyc_status=? ORDER BY created_at`, c.url.searchParams.get('status') ?? 'PENDING')
  .map((u) => ({ ...u, documents: q.all('SELECT id, kind, mime FROM kyc_documents WHERE user_id=?', u.id) })));
route('GET', '/api/admin/kyc/documents/:docId', { auth: 'admin' }, (c) => {
  const d = q.get('SELECT * FROM kyc_documents WHERE id=?', c.params.docId); if (!d) throw notFound();
  core.audit('admin', 'kyc.document.view', d.user_id, { doc: d.id });
  const buf = fs.readFileSync(d.path); c.res.writeHead(200, { 'Content-Type': d.mime, 'Content-Length': buf.length, 'Cache-Control': 'no-store' }); c.res.end(buf);
});
route('POST', '/api/admin/kyc/:userId/decision', { auth: 'admin' }, (c) => {
  if (c.body.decision !== 'VERIFIED' && c.body.decision !== 'REJECTED') throw bad('decision must be VERIFIED or REJECTED');
  core.decideKyc(c.params.userId, c.body.decision, Number(c.body.tier ?? 2), c.body.reason);
});
route('GET', '/api/admin/p2p/disputes', { auth: 'admin' }, () => q.all(`SELECT id, buyer_id, seller_id, asset, units, total_mwk, payment_ref, dispute_reason, updated_at FROM p2p_orders WHERE status='DISPUTED'`));
route('POST', '/api/admin/p2p/:orderId/resolve', { auth: 'admin' }, (c) => {
  if (c.body.action !== 'RELEASE' && c.body.action !== 'REFUND') throw bad('action must be RELEASE or REFUND');
  p2p.adminResolve(c.params.orderId, c.body.action);
});
route('GET', '/api/admin/ledger/verify', { auth: 'admin' }, () => verifyLedger());
route('POST', '/api/admin/users/reset-link', { auth: 'admin' }, (c) => core.adminResetLink(String(c.body.email ?? '')));
route('GET', '/api/admin/flags', { auth: 'admin' }, () => q.all("SELECT id, action, target, detail, created_at FROM audit_log WHERE action LIKE 'aml.%' OR action LIKE '%pep%' OR action LIKE 'withdrawal.%' ORDER BY id DESC LIMIT 100"));

// Admin console (static page; all data calls need the admin key)
route('GET', '/admin', { auth: 'none' }, (c) => { c.res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); c.res.end(adminHtml); });
route('GET', '/admin.js', { auth: 'none' }, (c) => { c.res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); c.res.end(adminJs); });
