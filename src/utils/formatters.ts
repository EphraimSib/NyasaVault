
export const formatMWK = (amount: number): string => {
  return new Intl.NumberFormat('en-MW', {
    style: 'currency',
    currency: 'MWK',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('MWK', 'MWK ');
};

export const formatUSD = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatCardNumber = (pan: string, visible: boolean = false): string => {
  const clean = pan.replace(/\s+/g, '');
  if (visible) {
    return clean.replace(/(\d{4})/g, '$1 ').trim();
  }
  const first4 = clean.slice(0, 4);
  const last4 = clean.slice(12, 16);
  return `${first4} •••• •••• ${last4}`;
};

export const formatPhoneNumber = (phone: string, masked: boolean = false): string => {
  if (!masked) return phone;
  // e.g. +265 991 482 109 -> +265 991 *** 109
  const parts = phone.split(' ');
  if (parts.length >= 4) {
    return `${parts[0]} ${parts[1]} *** ${parts[3]}`;
  }
  return phone;
};

export { calculateWithdrawalFee } from '../../shared/fees';
export type { WithdrawalFeeBreakdown } from '../../shared/fees';

/** "Today, 08:24" / "Yesterday, 19:15" / "06 Nov 2026, 14:10" in the user's local time. */
export const formatTimestamp = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${time}`;
};
