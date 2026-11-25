import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync('/tmp/nv-test-');
process.env.SANDBOX_DELAY_MS = '50';
const ADMIN = 'dev-admin-key-dev-admin-key-dev-admin-key';

let base = ''; let server: any;
before(async () => {
  const { createApp } = await import('../app.ts');
  server = createApp(); await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

class Client {
  cookie = '';
  async call(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    const j: any = await r.json().catch(() => ({})); return { status: r.status, data: j.data, error: j.error };
  }
  get = (p: string) => this.call('GET', p);
  post = (p: string, b?: any, h?: any) => this.call('POST', p, b ?? {}, h);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;
async function newUser(name = 'Chisomo Banda', phone?: string) {
  const c = new Client(); n++;
  const r = await c.post('/api/auth/register', { fullName: name, email: `u${n}@test.mw`, phone: phone ?? `+26599100${String(1000 + n)}`, telco: 'AIRTEL', password: 'correct-horse-battery', pin: '2468' });
  assert.equal(r.status, 200, JSON.stringify(r.error)); return c;
}
const kycBody = (extra: object = {}) => ({ idType: 'NATIONAL_ID', idNumber: `AB${Date.now().toString(36).toUpperCase()}${n}`, nationality: 'MALAWIAN', dateOfBirth: '1994-05-14', district: 'Lilongwe', address: 'Area 43, Lilongwe', occupation: 'Teacher', sourceOfFunds: 'SALARY', isPep: false, consent: true, documents: { idFront: JPG, idBack: JPG, selfie: JPG }, ...extra });
const JPG = 'data:image/jpeg;base64,' + Buffer.alloc(2000, 7).toString('base64');
async function verifyKyc(c: Client, tier = 2) {
  const s = await c.post('/api/kyc/submit', kycBody());
  assert.equal(s.status, 200, JSON.stringify(s.error));
  const me = (await c.get('/api/me')).data; const a = new Client();
  const d = await a.call('POST', `/api/admin/kyc/${me.id}/decision`, { decision: 'VERIFIED', tier }, { 'x-admin-key': ADMIN }); assert.equal(d.status, 200, JSON.stringify(d.error));
}
async function fund(c: Client, amount: number, phone = '+265991482109') {
  const d = await c.post('/api/wallet/deposit', { amountMWK: amount, provider: 'AIRTEL_MONEY', phone });
  assert.equal(d.status, 200, JSON.stringify(d.error)); await wait(200); return d.data;
}
const state = async (c: Client) => (await c.get('/api/state')).data;

test('auth: validation, weak pin, login, lockout, session required', async () => {
  const c = new Client();
  assert.equal((await c.get('/api/state')).status, 401);
  assert.equal((await c.post('/api/auth/register', { fullName: 'A B C', email: 'x@y.mw', phone: '+265991111111', telco: 'TNM', password: 'short', pin: '2468' })).status, 400);
  assert.equal((await c.post('/api/auth/register', { fullName: 'Weak Pin', email: 'wp@y.mw', phone: '+265991111112', telco: 'TNM', password: 'long-enough-pass', pin: '1234' })).status, 400);
  const u = await newUser(); const s = await state(u);
  assert.equal(s.user.kycTier, 1); assert.equal(s.card, null, 'no card before KYC'); assert.ok(!JSON.stringify(s).includes('pin_hash'));
  const dup = await new Client().post('/api/auth/register', { fullName: 'Dup User', email: `u${n}@test.mw`, phone: '+265991119999', telco: 'TNM', password: 'long-enough-pass', pin: '2468' });
  assert.equal(dup.status, 409);
  const email = `u${n}@test.mw`; const l = new Client();
  assert.equal((await l.post('/api/auth/login', { email, password: 'wrong-password-x' })).status, 401);
  assert.equal((await l.post('/api/auth/login', { email, password: 'correct-horse-battery' })).status, 200);
  for (let i = 0; i < 5; i++) await new Client().post('/api/auth/login', { email, password: 'nope-nope-nope' });
  assert.equal((await new Client().post('/api/auth/login', { email, password: 'correct-horse-battery' })).status, 429, 'account locks after 5 failures');
});

test('deposit: async settle credits wallet once; failure credits nothing; limits enforced', async () => {
  const c = await newUser();
  const tx = await fund(c, 50000); assert.equal(tx.status, 'PENDING');
  let s = await state(c); assert.equal(s.balanceMWK, 50000);
  assert.equal(s.transactions[0].status, 'COMPLETED');
  const bad = await c.post('/api/wallet/deposit', { amountMWK: 10000, provider: 'TNM_MPAMBA', phone: '+265888000000' }); await wait(200);
  s = await state(c); assert.equal(s.balanceMWK, 50000); assert.equal(s.transactions[0].status, 'FAILED');
  const over = await c.post('/api/wallet/deposit', { amountMWK: 200000, provider: 'AIRTEL_MONEY', phone: '+265991482109' });
  assert.equal(over.status, 403); assert.equal(over.error.code, 'DAILY_LIMIT');
  assert.equal((await c.post('/api/wallet/deposit', { amountMWK: 500, provider: 'AIRTEL_MONEY', phone: '+265991482109' })).status, 400);
  assert.equal((await c.post('/api/wallet/deposit', { amountMWK: -5, provider: 'AIRTEL_MONEY', phone: '+265991482109' })).status, 400);
  const k = { 'Idempotency-Key': 'abc-123' };
  const a = await c.post('/api/wallet/deposit', { amountMWK: 1000, provider: 'AIRTEL_MONEY', phone: '+265991482109' }, k); await wait(200);
  const b = await c.post('/api/wallet/deposit', { amountMWK: 1000, provider: 'AIRTEL_MONEY', phone: '+265991482109' }, k);
  assert.equal(a.data.id, b.data.id); assert.equal((await state(c)).balanceMWK, 51000);
});

test('withdraw: server-side fee, PIN check + lockout, reversal on provider failure', async () => {
  const c = await newUser(); await verifyKyc(c); await fund(c, 100000);
  const noPin = await c.post('/api/wallet/withdraw', { amountMWK: 10000, provider: 'AIRTEL_MONEY', phone: '+265991482109', pin: '0000' });
  assert.equal(noPin.status, 403); assert.equal(noPin.error.code, 'PIN_INVALID');
  const ok = await c.post('/api/wallet/withdraw', { amountMWK: 10000, provider: 'AIRTEL_MONEY', phone: '+265991482109', pin: '2468' });
  assert.equal(ok.status, 200, JSON.stringify(ok.error)); assert.equal(ok.data.status, 'COMPLETED'); assert.equal(ok.data.feeMWK, 250);
  assert.equal((await state(c)).balanceMWK, 100000 - 10000 - 250);
  const bank = await c.post('/api/wallet/withdraw', { amountMWK: 20000, provider: 'BANK_TRANSFER', bankId: 'nbm', accountNumber: '1004829102', accountName: 'Chisomo Banda', pin: '2468' });
  assert.equal(bank.data.feeMWK, 20000 * 0.015 + 750);
  const failed = await c.post('/api/wallet/withdraw', { amountMWK: 5000, provider: 'AIRTEL_MONEY', phone: '+265991000000', pin: '2468' });
  assert.equal(failed.data.status, 'FAILED'); const before = (await state(c)).balanceMWK;
  assert.equal(before, 100000 - 10250 - (20000 + 1050), 'failed payout fully reversed');
  const tooMuch = await c.post('/api/wallet/withdraw', { amountMWK: 90000, provider: 'AIRTEL_MONEY', phone: '+265991482109', pin: '2468' });
  assert.equal(tooMuch.status, 409);
  for (let i = 0; i < 5; i++) await c.post('/api/wallet/withdraw', { amountMWK: 3000, provider: 'AIRTEL_MONEY', phone: '+265991482109', pin: '9999' });
  const locked = await c.post('/api/wallet/withdraw', { amountMWK: 3000, provider: 'AIRTEL_MONEY', phone: '+265991482109', pin: '2468' });
  assert.equal(locked.error.code, 'PIN_LOCKED');
});

test('KYC: tier gating, doc validation, admin approval activates card and lifts limits', async () => {
  const c = await newUser();
  assert.equal((await c.post('/api/crypto/buy', { symbol: 'USDT', amountMWK: 5000, quotedPriceMWK: 1800 })).error.code, 'KYC_REQUIRED');
  assert.equal((await c.get('/api/card/details')).status, 404, 'no card before KYC');
  assert.equal((await c.post('/api/kyc/submit', kycBody({ dateOfBirth: '2015-01-01' }))).status, 400, 'minors rejected');
  assert.equal((await c.post('/api/kyc/submit', kycBody({ nationality: 'KENYAN' }))).error.code, 'MALAWIANS_ONLY');
  assert.equal((await c.post('/api/kyc/submit', kycBody({ consent: false }))).error.code, 'CONSENT_REQUIRED');
  assert.equal((await c.post('/api/kyc/submit', kycBody({ idType: 'LIBRARY_CARD' }))).status, 400);
  assert.equal((await c.post('/api/kyc/submit', kycBody({ idType: 'PASSPORT', documents: { idFront: JPG, selfie: JPG } }))).status, 200, 'passport needs no back image');
  assert.equal((await new Client().call('POST', '/api/admin/kyc/x/decision', { decision: 'VERIFIED' })).status, 401);
  const me = (await c.get('/api/me')).data; const adm = new Client();
  assert.equal((await adm.call('POST', `/api/admin/kyc/${me.id}/decision`, { decision: 'VERIFIED', tier: 2 }, { 'x-admin-key': ADMIN })).status, 200);
  const pend = await newUser('Pep Person'); assert.equal((await pend.post('/api/kyc/submit', kycBody({ isPep: true }))).status, 200);
  assert.equal((await adm.call('POST', `/api/admin/kyc/${(await pend.get('/api/me')).data.id}/decision`, { decision: 'VERIFIED', tier: 2 }, { 'x-admin-key': ADMIN })).status, 400, 'PEP needs EDD note');
  c.cookie = c.cookie;
  const s = await state(c); assert.equal(s.user.kycTier, 2); assert.equal(s.user.verificationStatus, 'VERIFIED'); assert.equal(s.card.status, 'ACTIVE'); assert.equal(s.card.cardHolder, 'CHISOMO BANDA', 'card issued in verified name after KYC');
  assert.equal(s.user.dailyLimitMWK, 5_000_000);
});

test('card: full details for cardholder, controls enforced on authorisation, burner rotates CVV', async () => {
  const c = await newUser(); await verifyKyc(c); await fund(c, 100000);
  const rev = (await c.get('/api/card/details')).data; assert.match(rev.cardNumber, /^\d{16}$/); assert.match(rev.cvv, /^\d{3}$/);
  const luhn = [...rev.cardNumber].reverse().reduce((s, d, i) => { let x = +d; if (i % 2) { x *= 2; if (x > 9) x -= 9; } return s + x; }, 0); assert.equal(luhn % 10, 0, 'PAN passes Luhn');
  const buy = (o: any) => c.post('/api/card/simulate-purchase', o);
  assert.equal((await buy({ merchant: 'Netflix', amountMWK: 24000, country: 'NL', usd: 13.99 })).data.approved, true);
  assert.equal((await buy({ merchant: 'Casino', amountMWK: 1000, mcc: '7995' })).data.approved, false);
  await c.call('PATCH', '/api/card/controls', { allowInternational: false });
  assert.match((await buy({ merchant: 'Amazon', amountMWK: 1000, country: 'US' })).data.reason, /International/);
  await c.post('/api/card/freeze', { frozen: true });
  assert.match((await buy({ merchant: 'Shoprite', amountMWK: 1000 })).data.reason, /frozen/);
  await c.post('/api/card/freeze', { frozen: false });
  await c.call('PATCH', '/api/card/controls', { isBurnerMode: true });
  assert.equal((await buy({ merchant: 'Shoprite', amountMWK: 1000 })).data.approved, true);
  const rev2 = (await c.get('/api/card/details')).data; assert.notEqual(rev2.cvv, rev.cvv, 'burner mode rotates CVV after use');
  await c.call('PATCH', '/api/card/controls', { monthlySpendLimitMWK: 30000 });
  assert.match((await buy({ merchant: 'Big', amountMWK: 10000 })).data.reason, /Monthly/);
  assert.match((await buy({ merchant: 'Huge', amountMWK: 99999999 })).data.reason, /limit|Insufficient/);
  const s = await state(c); assert.equal(s.card.cardNumber.includes(rev.cardNumber.slice(4, 12)), false, 'state never leaks PAN');
});

test('crypto: spread-priced buy/sell via ledger, slippage guard', async () => {
  const c = await newUser(); await verifyKyc(c); await fund(c, 100000);
  const a = (await state(c)).cryptoAssets.find((x: any) => x.symbol === 'USDT');
  assert.ok(a.buyPriceMWK > a.priceMWK && a.sellPriceMWK < a.priceMWK);
  assert.equal((await c.post('/api/crypto/buy', { symbol: 'USDT', amountMWK: 17510, quotedPriceMWK: a.buyPriceMWK * 1.1 })).error.code, 'PRICE_CHANGED');
  const b = await c.post('/api/crypto/buy', { symbol: 'USDT', amountMWK: 17510, quotedPriceMWK: a.buyPriceMWK }); assert.equal(b.status, 200, JSON.stringify(b.error));
  let s = await state(c); assert.equal(s.balanceMWK, 100000 - 17510);
  const usdt = s.cryptoAssets.find((x: any) => x.symbol === 'USDT').userBalance; assert.ok(usdt > 9 && usdt < 10);
  assert.equal((await c.post('/api/crypto/sell', { symbol: 'USDT', units: 50, quotedPriceMWK: a.sellPriceMWK })).error.code, 'INSUFFICIENT_FUNDS');
  const sl = await c.post('/api/crypto/sell', { symbol: 'USDT', units: usdt, quotedPriceMWK: a.sellPriceMWK }); assert.equal(sl.status, 200, JSON.stringify(sl.error));
  s = await state(c); assert.ok(s.balanceMWK < 100000 && s.balanceMWK > 100000 - 1000, 'round-trip costs only the spread');
});

test('P2P: real escrow between two users; only seller releases; cancel/expiry refunds', async () => {
  const seller = await newUser('Kondwani Phiri'); const buyer = await newUser('Alinafe Banda'); await verifyKyc(seller); await verifyKyc(buyer);
  await seller.post('/api/crypto/sandbox-faucet', { symbol: 'USDT', units: 500 });
  const mid = (await state(seller)).cryptoAssets.find((x: any) => x.symbol === 'USDT').priceMWK;
  const off = await seller.post('/api/p2p/offers', { type: 'SELL', cryptoSymbol: 'USDT', priceMWK: mid * 1.01, amountCrypto: 300, minLimitMWK: 10000, maxLimitMWK: 500000, paymentMethods: ['AIRTEL_MONEY'], paymentDetails: 'Airtel +265999123456' });
  assert.equal(off.status, 200, JSON.stringify(off.error));
  assert.equal((await seller.post('/api/p2p/offers', { type: 'SELL', cryptoSymbol: 'USDT', priceMWK: mid * 2, amountCrypto: 1, minLimitMWK: 1000, maxLimitMWK: 5000, paymentMethods: ['AIRTEL_MONEY'], paymentDetails: 'xxxxx' })).error.code, 'PRICE_OFF_MARKET');
  const offers = (await buyer.get('/api/p2p/offers?type=SELL&asset=USDT')).data; assert.equal(offers.length, 1); assert.equal(offers[0].userName, 'Kondwani P.');
  assert.equal((await seller.post('/api/p2p/orders', { offerId: off.data.id, amountMWK: 20000, method: 'AIRTEL_MONEY' })).status, 400, 'no self trade');
  const o = await buyer.post('/api/p2p/orders', { offerId: off.data.id, amountMWK: 20000, method: 'AIRTEL_MONEY' }); assert.equal(o.status, 200, JSON.stringify(o.error));
  const oid = o.data.id; assert.equal(o.data.role, 'BUYER');
  const sellerBal = async () => (await state(seller)).cryptoAssets.find((x: any) => x.symbol === 'USDT').userBalance;
  assert.ok((await sellerBal()) < 500 - 10, 'seller crypto locked in escrow');
  assert.equal((await buyer.post(`/api/p2p/orders/${oid}/release`, { pin: '2468' })).status, 403, 'buyer cannot release own escrow');
  assert.equal((await seller.post(`/api/p2p/orders/${oid}/release`, { pin: '2468' })).status, 409, 'cannot release before payment');
  assert.equal((await seller.post(`/api/p2p/orders/${oid}/paid`, { reference: 'AM123456' })).status, 403);
  assert.equal((await buyer.post(`/api/p2p/orders/${oid}/paid`, { reference: 'AM123456' })).status, 200);
  assert.equal((await seller.post(`/api/p2p/orders/${oid}/release`, { pin: '0001' })).status, 403);
  assert.equal((await seller.post(`/api/p2p/orders/${oid}/release`, { pin: '2468' })).status, 200);
  const bu = (await state(buyer)).cryptoAssets.find((x: any) => x.symbol === 'USDT').userBalance; assert.ok(bu > 10 && bu < 12);
  assert.equal((await buyer.get(`/api/p2p/orders/${oid}`)).data.status, 'COMPLETED');
  const o2 = await buyer.post('/api/p2p/orders', { offerId: off.data.id, amountMWK: 20000, method: 'AIRTEL_MONEY' }); const before = await sellerBal();
  assert.equal((await buyer.post(`/api/p2p/orders/${o2.data.id}/cancel`)).status, 200);
  assert.ok((await sellerBal()) > before, 'cancel refunds escrow to seller');
  const o3 = await buyer.post('/api/p2p/orders', { offerId: off.data.id, amountMWK: 20000, method: 'AIRTEL_MONEY' });
  await buyer.post(`/api/p2p/orders/${o3.data.id}/paid`, { reference: 'AM999999' });
  assert.equal((await buyer.post(`/api/p2p/orders/${o3.data.id}/dispute`, { reason: 'Seller not responding' })).status, 200);
  const a = new Client(); assert.equal((await a.call('POST', `/api/admin/p2p/${o3.data.id}/resolve`, { action: 'RELEASE' }, { 'x-admin-key': ADMIN })).status, 200);
  assert.equal((await buyer.get(`/api/p2p/orders/${o3.data.id}`)).data.status, 'COMPLETED');
  const third = await newUser(); assert.equal((await third.get(`/api/p2p/orders/${oid}`)).status, 404, 'outsiders cannot read orders');
});

test('2FA: enable with TOTP then login requires code', async () => {
  const { totpAt } = await import('../security.ts');
  const c = await newUser(); const email = `u${n}@test.mw`;
  const setup = (await c.post('/api/2fa/setup')).data; assert.match(setup.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.equal((await c.post('/api/2fa/enable', { code: '000000' })).status, 400);
  assert.equal((await c.post('/api/2fa/enable', { code: totpAt(setup.secret, Date.now()) })).status, 200);
  const l = new Client(); const r1 = await l.post('/api/auth/login', { email, password: 'correct-horse-battery' }); assert.equal(r1.error.code, 'TOTP_REQUIRED');
  assert.equal((await l.post('/api/auth/login', { email, password: 'correct-horse-battery', totp: totpAt(setup.secret, Date.now()) })).status, 200);
});

test('webhook: rejects bad signature; sessions can be revoked; ledger stays balanced', async () => {
  const c = new Client(); assert.equal((await c.post('/api/webhooks/mobile-money/AIRTEL_MONEY', { transaction: { id: 'x', status_code: 'TS' } })).status, 401);
  assert.equal((await c.post('/api/webhooks/mobile-money/NOPE', {})).status, 404);
  const u = await newUser(); const second = new Client(); await second.post('/api/auth/login', { email: `u${n}@test.mw`, password: 'correct-horse-battery' });
  const list = (await u.get('/api/sessions')).data; assert.equal(list.length, 2);
  await u.post('/api/sessions/revoke-others'); assert.equal((await second.get('/api/state')).status, 401);
  const v = await new Client().call('GET', '/api/admin/ledger/verify', undefined, { 'x-admin-key': ADMIN }); assert.deepEqual(v.data, { ok: true, problems: [] });
});

test('password reset: neutral response, single-use token, signs out sessions; admin page served', async () => {
  const u = await newUser(); const email = `u${n}@test.mw`; const a = new Client();
  const generic = await new Client().post('/api/auth/forgot', { email: 'nobody@test.mw' }); assert.equal(generic.status, 200);
  assert.equal((await new Client().post('/api/auth/reset', { token: 'bogus', newPassword: 'another-long-pass' })).error.code, 'RESET_INVALID');
  const r = await a.call('POST', '/api/admin/users/reset-link', { email }, { 'x-admin-key': ADMIN }); assert.equal(r.status, 200);
  const token = new URL(r.data.link).searchParams.get('reset')!;
  assert.equal((await new Client().post('/api/auth/reset', { token, newPassword: 'short' })).status, 400);
  assert.equal((await new Client().post('/api/auth/reset', { token, newPassword: 'brand-new-password' })).status, 200);
  assert.equal((await new Client().post('/api/auth/reset', { token, newPassword: 'brand-new-password2' })).error.code, 'RESET_INVALID', 'single use');
  assert.equal((await u.get('/api/state')).status, 401, 'old sessions revoked');
  assert.equal((await new Client().post('/api/auth/login', { email, password: 'brand-new-password' })).status, 200);
  const page = await fetch(base + '/admin'); assert.equal(page.status, 200); assert.match(await page.text(), /NyasaVault Admin/);
  assert.equal((await a.call('GET', '/api/admin/flags', undefined, { 'x-admin-key': ADMIN })).status, 200);
});
