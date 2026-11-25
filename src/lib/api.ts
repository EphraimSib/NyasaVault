import type { AppState, P2POffer, P2PTradeOrder, SessionInfo, Transaction, UserKycProfile, TelcoProvider, VirtualCardDetails } from '../types';
import { formatTimestamp } from '../utils/formatters';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach NyasaVault. Check your internet connection.');
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && json?.error?.code === 'UNAUTHORIZED') onUnauthorized();
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Something went wrong');
  }
  return json.data as T;
}
const get = <T,>(p: string) => request<T>('GET', p);
const post = <T,>(p: string, b: unknown = {}, h?: Record<string, string>) => request<T>('POST', p, b, h);

// ---- server → UI mappers (server sends ISO timestamps; UI shows friendly strings) ----
const mapTx = (t: Transaction): Transaction => ({ ...t, timestamp: formatTimestamp(t.timestamp) });
const mapOrder = (o: any): P2PTradeOrder => ({
  ...o,
  status: o.status === 'COMPLETED' ? 'ESCROW_RELEASED' : o.status,
  createdAt: formatTimestamp(o.createdAt),
  chatMessages: o.chatMessages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })),
});

export const api = {
  async state(): Promise<AppState> {
    const s = await get<AppState>('/state');
    return { ...s, transactions: s.transactions.map(mapTx), p2pOrders: (s.p2pOrders as any[]).map(mapOrder), securityLogs: s.securityLogs.map((l) => ({ ...l, timestamp: formatTimestamp(l.timestamp) })) };
  },
  config: () => get<AppState['config']>('/config'),
  register: (b: { fullName: string; email: string; phone: string; telco: 'AIRTEL' | 'TNM'; password: string; pin: string }) => post<UserKycProfile>('/auth/register', b),
  login: (b: { email: string; password: string; totp?: string }) => post<UserKycProfile>('/auth/login', b),
  logout: () => post<void>('/auth/logout'),
  forgot: (email: string) => post<{ message: string }>('/auth/forgot', { email }),
  reset: (token: string, newPassword: string) => post<void>('/auth/reset', { token, newPassword }),
  changePassword: (currentPassword: string, newPassword: string) => post<void>('/auth/change-password', { currentPassword, newPassword }),
  changePin: (currentPin: string, newPin: string) => post<void>('/pin/change', { currentPin, newPin }),
  totpSetup: () => post<{ secret: string; otpauthUrl: string }>('/2fa/setup'),
  totpEnable: (code: string) => post<void>('/2fa/enable', { code }),
  totpDisable: (pin: string, code: string) => post<void>('/2fa/disable', { pin, code }),
  sessions: () => get<SessionInfo[]>('/sessions'),
  revokeSession: (id: string) => request<void>('DELETE', `/sessions/${id}`),
  revokeOtherSessions: () => post<void>('/sessions/revoke-others'),
  submitKyc: (b: object) => post<void>('/kyc/submit', b),

  async transaction(id: string) { return mapTx(await get<Transaction>(`/transactions/${id}`)); },
  async deposit(b: { amountMWK: number; provider: TelcoProvider; phone: string }, idem: string) { return mapTx(await post<Transaction>('/wallet/deposit', b, { 'Idempotency-Key': idem })); },
  async withdraw(b: object, idem: string) { return mapTx(await post<Transaction>('/wallet/withdraw', b, { 'Idempotency-Key': idem })); },

  cardDetails: () => get<{ cardNumber: string; cvv: string; expiryMonth: string; expiryYear: string }>('/card/details'),
  rotateCvv: (pin: string) => post<{ cvv: string }>('/card/rotate-cvv', { pin }),
  freezeCard: (frozen: boolean) => post<void>('/card/freeze', { frozen }),
  cardControls: (b: Partial<Pick<VirtualCardDetails, 'monthlySpendLimitMWK' | 'allowInternational' | 'allowOnlineGambling' | 'isBurnerMode'>>) => request<void>('PATCH', '/card/controls', b),
  simulatePurchase: (b: object) => post<{ approved: boolean; reason?: string }>('/card/simulate-purchase', b),

  buyCrypto: (symbol: string, amountMWK: number, quotedPriceMWK: number) => post<{ units: number }>('/crypto/buy', { symbol, amountMWK, quotedPriceMWK }),
  sellCrypto: (symbol: string, units: number, quotedPriceMWK: number) => post<{ mwk: number }>('/crypto/sell', { symbol, units, quotedPriceMWK }),
  faucet: (symbol: string, units: number) => post<void>('/crypto/sandbox-faucet', { symbol, units }),

  p2pOffers: () => get<P2POffer[]>('/p2p/offers'),
  createOffer: (b: object) => post<{ id: string }>('/p2p/offers', b),
  closeOffer: (id: string) => request<void>('DELETE', `/p2p/offers/${id}`),
  async p2pOrders() { return (await get<any[]>('/p2p/orders')).map(mapOrder); },
  async p2pOrder(id: string) { return mapOrder(await get<any>(`/p2p/orders/${id}`)); },
  async createOrder(b: object) { return mapOrder(await post<any>('/p2p/orders', b)); },
  markPaid: (id: string, reference: string) => post<void>(`/p2p/orders/${id}/paid`, { reference }),
  release: (id: string, pin: string) => post<void>(`/p2p/orders/${id}/release`, { pin }),
  cancelOrder: (id: string) => post<void>(`/p2p/orders/${id}/cancel`),
  disputeOrder: (id: string, reason: string) => post<void>(`/p2p/orders/${id}/dispute`, { reason }),
  sendMessage: (id: string, text: string) => post<void>(`/p2p/orders/${id}/messages`, { text }),
};
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
