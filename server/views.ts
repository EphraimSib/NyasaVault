import { config } from './config.ts';
import { q, type Row } from './db.ts';
import { fromTambala } from './money.ts';
import { balanceOf, userAcct } from './ledger.ts';
import { capabilities } from './providers/mobileMoney.ts';
import { cardIssuingAvailable } from './providers/cardIssuer.ts';
import { monthSpent } from './services/card.ts';
import { assets } from './services/crypto.ts';
import { listOffers, myOrders } from './services/p2p.ts';
import type { Ctx } from './http.ts';

const iso = (t?: number | null) => (t ? new Date(t).toISOString() : '');

export function userView(u: Row) {
  const lim = config.tierLimits[u.kyc_tier];
  return {
    id: u.id, fullName: u.full_name, preferredName: u.preferred_name, nationalIdNumber: u.national_id ?? '', idType: u.id_type ?? '', nationality: u.nationality ?? '', taxNumber: u.tax_number ?? '', phoneNumber: u.phone,
    telcoProvider: u.telco, email: u.email, district: u.district ?? '', residentialAddress: u.address ?? '', dateOfBirth: u.dob ?? '', kycTier: u.kyc_tier,
    verificationStatus: u.kyc_status === 'NONE' ? 'UNVERIFIED' : u.kyc_status, kycRejectReason: u.kyc_reject_reason ?? undefined, verifiedAt: iso(u.kyc_verified_at),
    dailyLimitMWK: lim.daily, monthlyLimitMWK: lim.monthly, avatarUrl: '', totpEnabled: !!u.totp_enabled,
  };
}

export function cardView(u: Row) {
  const c = q.get('SELECT * FROM cards WHERE user_id=?', u.id); if (!c) return null;
  return {
    id: c.id, cardNumber: `${c.bin}XXXXXXXX${c.last4}`, cardHolder: c.holder, expiryMonth: c.exp_month, expiryYear: c.exp_year, cvv: '•••', brand: c.brand, cardType: 'VIRTUAL_DEBIT_CREDIT',
    status: c.status, linkedCurrency: 'MWK', balanceMWK: fromTambala(balanceOf(userAcct(u.id), 'MWK')),
    monthlySpendLimitMWK: fromTambala(c.monthly_limit), currentMonthSpentMWK: fromTambala(monthSpent(c.id)), allowInternational: !!c.allow_intl, allowOnlineGambling: !!c.allow_gambling,
    isBurnerMode: !!c.burner, billingAddress: { line1: u.address ?? 'Not provided', city: u.district ?? '', country: 'Malawi', postalCode: '' },
  };
}

export function txView(t: Row) {
  return {
    id: t.id, timestamp: iso(t.created_at), type: t.type, title: t.title, description: t.description, amountMWK: fromTambala(t.amount_mwk), feeMWK: fromTambala(t.fee_mwk),
    netAmountMWK: fromTambala(t.amount_mwk), equivalentUSD: t.equivalent_usd ?? undefined, channel: t.channel, operatorReference: t.reference, status: t.status,
    recipientOrMerchant: t.counterparty ?? undefined, direction: t.direction,
  };
}
export const listTransactions = (userId: string, limit = 100) => q.all('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT ?', userId, limit).map(txView);

const device = (ua?: string) => { if (!ua) return 'Unknown device'; const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'; const o = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''; return `${b}${o ? ' on ' + o : ''}`; };
export const securityLogs = (userId: string) => q.all('SELECT * FROM security_logs WHERE user_id=? ORDER BY id DESC LIMIT 50', userId).map((l) => ({ id: String(l.id), timestamp: iso(l.created_at), activity: l.activity, location: 'Location unavailable', ipAddress: l.ip ?? '—', device: device(l.user_agent), status: l.status }));

export const publicConfig = () => ({
  sandbox: config.providerMode === 'sandbox', channels: capabilities(), cardIssuing: cardIssuingAvailable(), spreadBps: config.cryptoSpreadBps,
  tierLimits: config.tierLimits, p2pOrderTtlMinutes: config.p2pOrderTtlMinutes, licenceNotice: config.licenceNotice,
});

/** One call that hydrates the whole UI. */
export async function bootstrap(c: Ctx) {
  const u = c.user!;
  let cryptoAssets: unknown[] = []; let pricesError: string | null = null;
  try { cryptoAssets = await assets(u.id); } catch (e) { pricesError = (e as Error).message; }
  return {
    user: userView(u), balanceMWK: fromTambala(balanceOf(userAcct(u.id), 'MWK')), card: cardView(u), cryptoAssets, pricesError, transactions: listTransactions(u.id), p2pOffers: listOffers(c), p2pOrders: myOrders(c),
    securityLogs: securityLogs(u.id), config: publicConfig(),
  };
}
