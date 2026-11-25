export type CurrencyCode = 'MWK' | 'USD';

export type TelcoProvider = 'AIRTEL_MONEY' | 'TNM_MPAMBA' | 'BANK_TRANSFER';

export type { BankOption } from '../../shared/banks';

export interface UserKycProfile {
  id: string;
  fullName: string;
  preferredName: string;
  nationalIdNumber: string; // Malawi NRB National ID e.g. 10892408X01
  taxNumber: string; // MRA Tax ID
  phoneNumber: string; // +265...
  telcoProvider: 'AIRTEL' | 'TNM';
  email: string;
  district: string; // Lilongwe, Blantyre, etc.
  residentialAddress: string;
  dateOfBirth: string;
  kycTier: 1 | 2 | 3;
  verificationStatus: 'VERIFIED' | 'PENDING' | 'REJECTED' | 'UNVERIFIED';
  kycRejectReason?: string;
  idType?: string;
  nationality?: string;
  totpEnabled: boolean;
  verifiedAt: string;
  dailyLimitMWK: number;
  monthlyLimitMWK: number;
  avatarUrl: string;
}

export interface VirtualCardDetails {
  id: string;
  cardNumber: string; // 16 digits
  cardHolder: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  brand: 'VISA' | 'MASTERCARD';
  cardType: 'VIRTUAL_DEBIT_CREDIT';
  status: 'ACTIVE' | 'FROZEN' | 'TERMINATED';
  kycLocked?: boolean; // card activates after KYC approval
  linkedCurrency: 'MWK';
  balanceMWK: number;
  monthlySpendLimitMWK: number;
  currentMonthSpentMWK: number;
  allowInternational: boolean;
  allowOnlineGambling: boolean;
  isBurnerMode: boolean; // Auto regenerate CVV after use
  billingAddress: {
    line1: string;
    city: string;
    country: string;
    postalCode: string;
  };
}

export interface Transaction {
  id: string;
  timestamp: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'CARD_PAYMENT' | 'CRYPTO_BUY' | 'CRYPTO_SELL' | 'P2P_TRANSFER';
  title: string;
  description: string;
  amountMWK: number;
  feeMWK: number;
  netAmountMWK: number;
  equivalentUSD?: number;
  channel: 'AIRTEL_MONEY' | 'TNM_MPAMBA' | 'BANK_TRANSFER' | 'VIRTUAL_CARD' | 'P2P_ESCROW' | 'CRYPTO_DESK';
  operatorReference: string; // e.g. AM98294821 or MP7710294
  status: 'COMPLETED' | 'PENDING' | 'PROCESSING' | 'FAILED';
  recipientOrMerchant?: string;
  direction: 'INCOMING' | 'OUTGOING';
}

export interface CryptoAsset {
  symbol: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'SOL';
  name: string;
  priceUSD: number;
  priceMWK: number;
  change24h: number;
  userBalance: number;
  network: string;
  depositAddress: string | null; // null when no custody provider is configured
  buyPriceMWK: number;
  sellPriceMWK: number;
}

export interface P2POffer {
  id: string;
  userId: string;
  userName: string;
  userRating: number;
  tradesCount: number;
  type: 'BUY' | 'SELL';
  cryptoSymbol: 'USDT' | 'BTC' | 'USDC';
  priceMWK: number; // e.g. 1,780 MWK per USDT
  availableCrypto: number;
  minLimitMWK: number;
  maxLimitMWK: number;
  paymentMethods: TelcoProvider[];
  paymentDetails: string;
  isOnline: boolean;
  autoEscrowEnabled: boolean;
  isMine?: boolean;
}

export interface P2PTradeOrder {
  id: string;
  offerId: string;
  type: 'BUY' | 'SELL';
  cryptoSymbol: 'USDT' | 'BTC' | 'USDC';
  cryptoAmount: number;
  totalMWK: number;
  priceMWK: number;
  counterpartyName: string;
  counterpartyRating: number;
  paymentMethod: TelcoProvider;
  sellerPaymentAccount: string;
  status: 'PENDING_PAYMENT' | 'PAYMENT_SENT' | 'ESCROW_RELEASED' | 'CANCELLED' | 'DISPUTED';
  createdAt: string;
  expiresInSeconds: number;
  escrowLocked: boolean;
  role: 'BUYER' | 'SELLER';
  expiresAt: string;
  paymentProofReference?: string;
  chatMessages: {
    id: string;
    sender: 'YOU' | 'COUNTERPARTY' | 'SYSTEM';
    text: string;
    timestamp: string;
  }[];
}

export interface SecurityLog {
  id: string;
  timestamp: string;
  activity: string;
  location: string;
  ipAddress: string;
  device: string;
  status: 'SUCCESS' | 'FLAGGED' | 'BLOCKED';
}

export interface ChannelCaps { deposit: boolean; withdraw: boolean }
export interface AppConfig {
  sandbox: boolean;
  channels: Record<TelcoProvider, ChannelCaps>;
  cardIssuing: boolean;
  spreadBps: number;
  tierLimits: Record<number, { daily: number; monthly: number }>;
  p2pOrderTtlMinutes: number;
  licenceNotice: string;
}
export interface SessionInfo { id: string; createdAt: number; lastSeenAt: number; ip: string; device: string; current: boolean }
export interface AppState {
  user: UserKycProfile;
  balanceMWK: number;
  card: VirtualCardDetails | null;
  cryptoAssets: CryptoAsset[];
  pricesError: string | null;
  transactions: Transaction[];
  p2pOffers: P2POffer[];
  p2pOrders: P2PTradeOrder[];
  securityLogs: SecurityLog[];
  config: AppConfig;
}
