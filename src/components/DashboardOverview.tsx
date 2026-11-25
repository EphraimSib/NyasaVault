import React, { useState } from 'react';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  CreditCard, 
  ArrowLeftRight, 
  Coins, 
  ShieldCheck, 
  Receipt, 
  ExternalLink, 
  Clock, 
  CheckCircle2,
  Lock,
  Smartphone,
  Building2,
  AlertCircle
} from 'lucide-react';
import { Transaction, UserKycProfile, VirtualCardDetails, CryptoAsset } from '../types';
import { Avatar } from './Avatar';
import { formatMWK, formatUSD, formatCardNumber } from '../utils/formatters';

interface DashboardOverviewProps {
  user: UserKycProfile;
  card: VirtualCardDetails | null;
  cryptoAssets: CryptoAsset[];
  transactions: Transaction[];
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onNavigateToCard: () => void;
  onNavigateToP2P: () => void;
  onNavigateToCrypto: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onOpenKyc: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  user,
  card,
  cryptoAssets,
  transactions,
  onOpenDeposit,
  onOpenWithdraw,
  onNavigateToCard,
  onNavigateToP2P,
  onNavigateToCrypto,
  onSelectTransaction,
  onOpenKyc,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'MOBILE' | 'CARD' | 'P2P'>('ALL');

  const totalCryptoUSD = cryptoAssets.reduce((sum, a) => sum + (a.userBalance * a.priceUSD), 0);
  const totalCryptoMWK = cryptoAssets.reduce((sum, a) => sum + a.userBalance * a.priceMWK, 0);
  const totalLiquidMWK = card?.balanceMWK ?? 0;
  const combinedNetWorthMWK = totalLiquidMWK + totalCryptoMWK;

  const filteredTransactions = transactions.filter((tx) => {
    if (filterType === 'MOBILE') return tx.channel === 'AIRTEL_MONEY' || tx.channel === 'TNM_MPAMBA';
    if (filterType === 'CARD') return tx.channel === 'VIRTUAL_CARD';
    if (filterType === 'P2P') return tx.channel === 'P2P_ESCROW' || tx.channel === 'BANK_TRANSFER';
    return true;
  });

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Welcome Banner & KYC Quick Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-slate-800">
        <div className="flex items-center gap-4">
          <Avatar name={user.fullName} className="w-14 h-14 text-lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Moni, {user.preferredName}!
              </h1>
              <button onClick={onOpenKyc} className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded flex items-center gap-1 cursor-pointer border ${user.verificationStatus === 'VERIFIED' ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80' : 'text-amber-300 bg-amber-950/60 border-amber-800/70'}`}>
                <CheckCircle2 className="w-2.5 h-2.5" />
                {user.verificationStatus === 'VERIFIED' ? `Tier ${user.kycTier} Verified` : user.verificationStatus === 'PENDING' ? 'KYC under review' : user.verificationStatus === 'REJECTED' ? 'KYC rejected: resubmit' : `Tier ${user.kycTier}: verify your ID`}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {user.nationalIdNumber ? <>Malawi NRB: <span className="font-mono text-slate-300 font-semibold">{user.nationalIdNumber}</span> · {user.district}, Malawi</> : <>Daily limit {formatMWK(user.dailyLimitMWK)}. Verify your National ID to unlock the card, crypto and P2P.</>}
            </p>
          </div>
        </div>

        {/* Action Button cluster */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenDeposit}
            className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Deposit (Airtel/TNM)</span>
          </button>
          
          <button
            onClick={onOpenWithdraw}
            className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
            <span>Withdraw Funds</span>
          </button>
        </div>
      </div>

      {/* Primary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Metric 1: Liquid Cloud Banking & Card Balance */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Liquid Balance (MWK)</span>
            <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">
              100% On-Card
            </span>
          </div>
          <div className="font-mono text-3xl font-bold text-white tabular-nums tracking-tight">
            {formatMWK(totalLiquidMWK)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
            <span>USD Equiv: {formatUSD(totalLiquidMWK / (cryptoAssets.find((a) => a.symbol === 'USDT')?.priceMWK || 1751))}</span>
            <span className="text-[11px] text-emerald-400">Rate: 1 USD = {Math.round(cryptoAssets.find((a) => a.symbol === 'USDT')?.priceMWK ?? 0).toLocaleString('en-US')} MWK</span>
          </div>
        </div>

        {/* Metric 2: Virtual Card Quick State */}
        <div 
          onClick={onNavigateToCard}
          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2 cursor-pointer hover:border-slate-700 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Visual Virtual Card</span>
            <CreditCard className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="font-mono text-xl font-bold text-white tracking-widest">
            {card ? formatCardNumber(card.cardNumber, false) : 'No card issued'}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
            <span className={card?.status === 'ACTIVE' ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>
              {card?.status === 'ACTIVE' ? '● Ready for Online / Int’l' : card?.kycLocked ? '● Activates after KYC' : '● Card Frozen'}
            </span>
            <span className="font-mono text-slate-300">Exp: {card ? `${card.expiryMonth}/${card.expiryYear}` : '--/--'}</span>
          </div>
        </div>

        {/* Metric 3: Crypto Portfolio & P2P Reserve */}
        <div 
          onClick={onNavigateToCrypto}
          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2 cursor-pointer hover:border-slate-700 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Crypto Portfolio</span>
            <Coins className="w-4 h-4 text-teal-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            {formatMWK(totalCryptoMWK)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
            <span>{formatUSD(totalCryptoUSD)}</span>
            <span className="text-teal-400 font-sans">Trade on P2P →</span>
          </div>
        </div>
      </div>

      {/* Feature Navigation Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={onNavigateToCard}
          className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2 group-hover:scale-105 transition-transform">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-white">Visual Card</div>
          <div className="text-[11px] text-slate-400">Online & Int'l Spend</div>
        </button>

        <button
          onClick={onOpenDeposit}
          className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 mb-2 group-hover:scale-105 transition-transform">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-white">Airtel / TNM Push</div>
          <div className="text-[11px] text-slate-400">Instant Mobile Deposit</div>
        </button>

        <button
          onClick={onNavigateToP2P}
          className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 mb-2 group-hover:scale-105 transition-transform">
            <ArrowLeftRight className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-white">P2P Trading</div>
          <div className="text-[11px] text-slate-400">Malawi Escrow Desk</div>
        </button>

        <button
          onClick={onNavigateToCrypto}
          className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 mb-2 group-hover:scale-105 transition-transform">
            <Coins className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-white">Buy Crypto</div>
          <div className="text-[11px] text-slate-400">BTC, USDT, SOL</div>
        </button>
      </div>

      {/* Recent Activity Table & Filter */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Transaction Audit Ledger</h2>
            <p className="text-xs text-slate-400">Real-time Reserve Bank of Malawi verified logs</p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 text-xs">
            {(['ALL', 'MOBILE', 'CARD', 'P2P'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterType(filter)}
                className={`px-3 py-1 font-medium rounded-md transition-all cursor-pointer ${
                  filterType === filter
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter === 'ALL' ? 'All Ledger' : filter === 'MOBILE' ? 'Mobile Money' : filter === 'CARD' ? 'Card Payments' : 'Bank & P2P'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Description & Channel</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Fee</th>
                <th className="px-4 py-3 text-right">Net Amount (MWK)</th>
                <th className="px-4 py-3 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans text-xs">
              {filteredTransactions.map((tx) => {
                const isIncoming = tx.direction === 'INCOMING';
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Title & Channel */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-200">{tx.title}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">
                        {tx.description}
                      </div>
                    </td>

                    {/* Timestamp */}
                    <td className="px-4 py-3.5 font-mono text-slate-400 tabular-nums">
                      {tx.timestamp}
                    </td>

                    {/* Operator Reference */}
                    <td className="px-4 py-3.5 font-mono text-slate-300">
                      {tx.operatorReference}
                    </td>

                    {/* Fee (Notice withdrawal fees are clearly shown!) */}
                    <td className="px-4 py-3.5 text-right font-mono text-slate-400 tabular-nums">
                      {tx.feeMWK > 0 ? (
                        <span className="text-amber-400 font-semibold">{formatMWK(tx.feeMWK)}</span>
                      ) : (
                        <span className="text-slate-400">MWK 0.00</span>
                      )}
                    </td>

                    {/* Net Amount */}
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-sm tabular-nums">
                      <span className={isIncoming ? 'text-emerald-400' : 'text-slate-100'}>
                        {isIncoming ? '+' : '-'} {formatMWK(tx.amountMWK)}
                      </span>
                      {tx.equivalentUSD && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          ~ {formatUSD(tx.equivalentUSD)}
                        </span>
                      )}
                    </td>

                    {/* Receipt Action */}
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => onSelectTransaction(tx)}
                        className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                        title="View Official Digital Receipt"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RBM Regulatory Transparency Notice */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 flex items-start gap-3 text-xs text-slate-400">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-200">Reserve Bank of Malawi Regulatory Compliance</span>
          <p className="mt-0.5">
            NyasaVault operates in full conformity with the National Payment Systems Act and Reserve Bank of Malawi Anti-Money Laundering & Combating Financing of Terrorism (AML/CFT) Directives. Third-party withdrawal fees are assessed transparently to cover interbank NatSwitch clearance and telco carrier network costs.
          </p>
        </div>
      </div>
    </div>
  );
};
