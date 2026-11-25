// Single source of truth for fees. Imported by BOTH the UI (to preview) and the server (to charge).
export type FeeChannel = 'AIRTEL_MONEY' | 'TNM_MPAMBA' | 'BANK_TRANSFER';

export interface WithdrawalFeeBreakdown {
  transferAmount: number;
  operatorFee: number;
  clearingFee: number;
  totalFee: number;
  netDebit: number;
  feeRateText: string;
}

/** All values in whole MWK. */
export function calculateWithdrawalFee(amount: number, channel: FeeChannel): WithdrawalFeeBreakdown {
  if (!(amount > 0)) {
    return { transferAmount: 0, operatorFee: 0, clearingFee: 0, totalFee: 0, netDebit: 0, feeRateText: '0%' };
  }
  if (channel === 'BANK_TRANSFER') {
    const operatorFee = Math.round(amount * 0.015);
    const clearingFee = 750;
    const totalFee = operatorFee + clearingFee;
    return { transferAmount: amount, operatorFee, clearingFee, totalFee, netDebit: amount + totalFee, feeRateText: '1.5% + MWK 750 NatSwitch Clearing' };
  }
  const operatorFee = Math.max(250, Math.round(amount * 0.01));
  return { transferAmount: amount, operatorFee, clearingFee: 0, totalFee: operatorFee, netDebit: amount + operatorFee, feeRateText: '1.0% Telco Network Fee (Min MWK 250)' };
}

export const MIN_DEPOSIT_MWK = 1000;
export const MIN_WITHDRAWAL_MWK = 2000;
