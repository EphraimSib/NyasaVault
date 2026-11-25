import { createHmac } from 'node:crypto';
import { config } from '../config.ts';
import { HttpError } from '../errors.ts';
import { safeEqual } from '../security.ts';

export type MmStatus = 'PENDING' | 'SUCCESS' | 'FAILED';
export type Channel = 'AIRTEL_MONEY' | 'TNM_MPAMBA' | 'BANK_TRANSFER';
export interface CollectReq { reference: string; msisdn: string; amountMWK: number; narration: string }
export interface DisburseReq { reference: string; amountMWK: number; msisdn?: string; bank?: { code: string; accountNumber: string; accountName: string } }
export interface Result { providerRef: string; status: MmStatus }

export interface Provider {
  readonly id: Channel;
  readonly canCollect: boolean;
  readonly canDisburse: boolean;
  collect(r: CollectReq): Promise<Result>;
  disburse(r: DisburseReq): Promise<Result>;
  status(reference: string): Promise<MmStatus>;
  verifyWebhook(headers: Record<string, any>, raw: string): boolean;
  parseWebhook(body: any): { reference: string; status: MmStatus; providerRef: string } | null;
}

type SettleHook = (reference: string, status: MmStatus, providerRef: string) => void;
let settleHook: SettleHook = () => {};
export const onProviderSettled = (fn: SettleHook) => { settleHook = fn; };

/** Sandbox: NO real money moves. Numbers ending 0000 fail (to test reversal paths). */
class SandboxProvider implements Provider {
  canCollect = true; canDisburse = true;
  private created = new Map<string, number>();
  id: Channel;
  constructor(id: Channel) { this.id = id; }
  private outcome(msisdn?: string): MmStatus { return msisdn?.replace(/\D/g, '').endsWith('0000') ? 'FAILED' : 'SUCCESS'; }
  async collect(r: CollectReq): Promise<Result> {
    this.created.set(r.reference, Date.now());
    const result = this.outcome(r.msisdn);
    const t = setTimeout(() => settleHook(r.reference, result, `SBX-${r.reference.slice(-8)}`), config.sandboxDelayMs);
    t.unref();
    return { providerRef: `SBX-${r.reference.slice(-8)}`, status: 'PENDING' };
  }
  async disburse(r: DisburseReq): Promise<Result> {
    return { providerRef: `SBX-OUT-${r.reference.slice(-8)}`, status: this.outcome(r.msisdn ?? r.bank?.accountNumber) };
  }
  async status(reference: string): Promise<MmStatus> {
    const t = this.created.get(reference);
    return t && Date.now() - t < config.sandboxDelayMs ? 'PENDING' : 'SUCCESS';
  }
  verifyWebhook() { return false; } // sandbox never accepts webhooks
  parseWebhook() { return null; }
}

/**
 * Airtel Money Open API (collections). Written from Airtel Africa's public Open API
 * conventions (OAuth2 client-credentials, /merchant/v2/payments/, X-Country/X-Currency headers).
 * VERIFY every path, field and status code against YOUR merchant documentation and sandbox before go-live.
 * Disbursement needs your merchant PIN encrypted with Airtel's RSA key and is intentionally NOT implemented.
 */
class AirtelProvider implements Provider {
  id: Channel = 'AIRTEL_MONEY';
  canCollect = !!(config.airtel.baseUrl && config.airtel.clientId && config.airtel.clientSecret);
  canDisburse = false;
  private token?: { v: string; exp: number };
  private async auth(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.v;
    const r = await fetch(`${config.airtel.baseUrl}/auth/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ client_id: config.airtel.clientId, client_secret: config.airtel.clientSecret, grant_type: 'client_credentials' }),
    });
    if (!r.ok) throw new HttpError(502, 'PROVIDER_ERROR', 'Airtel authentication failed');
    const j: any = await r.json();
    this.token = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
    return this.token.v;
  }
  private headers(tok: string) { return { 'Content-Type': 'application/json', Accept: '*/*', 'X-Country': 'MW', 'X-Currency': 'MWK', Authorization: `Bearer ${tok}` }; }
  private map(code?: string): MmStatus { return code === 'TS' ? 'SUCCESS' : code === 'TF' || code === 'TE' ? 'FAILED' : 'PENDING'; }
  async collect(r: CollectReq): Promise<Result> {
    const tok = await this.auth();
    const res = await fetch(`${config.airtel.baseUrl}/merchant/v2/payments/`, {
      method: 'POST', headers: this.headers(tok),
      body: JSON.stringify({
        reference: r.narration.slice(0, 40),
        subscriber: { country: 'MW', currency: 'MWK', msisdn: r.msisdn.replace(/^\+?265/, '').replace(/\D/g, '') },
        transaction: { amount: r.amountMWK, country: 'MW', currency: 'MWK', id: r.reference },
      }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.status?.success === false) throw new HttpError(502, 'PROVIDER_ERROR', 'Airtel rejected the payment request');
    return { providerRef: j?.data?.transaction?.id ?? r.reference, status: this.map(j?.data?.transaction?.status) };
  }
  async disburse(): Promise<Result> { throw new HttpError(503, 'CHANNEL_UNAVAILABLE', 'Airtel Money withdrawals are not enabled'); }
  async status(reference: string): Promise<MmStatus> {
    const tok = await this.auth();
    const res = await fetch(`${config.airtel.baseUrl}/standard/v1/payments/${encodeURIComponent(reference)}`, { headers: this.headers(tok) });
    const j: any = await res.json().catch(() => ({}));
    return res.ok ? this.map(j?.data?.transaction?.status) : 'PENDING';
  }
  verifyWebhook(headers: Record<string, any>, raw: string): boolean {
    const sig = String(headers['x-signature'] ?? '');
    return !!sig && safeEqual(sig, createHmac('sha256', config.webhookSecret).update(raw).digest('hex'));
  }
  parseWebhook(body: any) {
    const t = body?.transaction; if (!t?.id) return null;
    return { reference: String(t.id), status: this.map(t.status_code), providerRef: String(t.airtel_money_id ?? t.id) };
  }
}

/** TNM Mpamba has no public API; wire in the biller/merchant API you are given by TNM. */
class UnconfiguredProvider implements Provider {
  canCollect = false; canDisburse = false;
  id: Channel;
  constructor(id: Channel) { this.id = id; }
  private fail(): never { throw new HttpError(503, 'CHANNEL_UNAVAILABLE', `${this.id} is not enabled on this deployment`); }
  async collect(): Promise<Result> { return this.fail(); }
  async disburse(): Promise<Result> { return this.fail(); }
  async status(): Promise<MmStatus> { return this.fail(); }
  verifyWebhook() { return false; }
  parseWebhook() { return null; }
}

const live: Record<Channel, Provider> = {
  AIRTEL_MONEY: new AirtelProvider(),
  TNM_MPAMBA: new UnconfiguredProvider('TNM_MPAMBA'),
  BANK_TRANSFER: new UnconfiguredProvider('BANK_TRANSFER'),
};
const sandbox: Record<Channel, Provider> = {
  AIRTEL_MONEY: new SandboxProvider('AIRTEL_MONEY'),
  TNM_MPAMBA: new SandboxProvider('TNM_MPAMBA'),
  BANK_TRANSFER: new SandboxProvider('BANK_TRANSFER'),
};
export const getProvider = (c: Channel): Provider => (config.providerMode === 'sandbox' ? sandbox : live)[c];
export const isChannel = (c: any): c is Channel => c === 'AIRTEL_MONEY' || c === 'TNM_MPAMBA' || c === 'BANK_TRANSFER';
export const capabilities = () =>
  Object.fromEntries((Object.keys(live) as Channel[]).map((c) => [c, { deposit: getProvider(c).canCollect, withdraw: getProvider(c).canDisburse }]));
