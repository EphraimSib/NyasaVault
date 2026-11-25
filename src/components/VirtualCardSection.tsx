import React, { useEffect, useState } from 'react';
import { 
  CreditCard, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Globe, 
  RotateCw, 
  Copy, 
  Check, 
  ShieldCheck, 
  Sparkles, 
  Sliders, 
  Flame, 
  AlertTriangle,
  Receipt,
  ExternalLink
} from 'lucide-react';
import { VirtualCardDetails, UserKycProfile, Transaction } from '../types';
import { formatMWK, formatUSD, formatCardNumber } from '../utils/formatters';
import { api, errMsg } from '../lib/api';

interface VirtualCardSectionProps {
  card: VirtualCardDetails;
  user: UserKycProfile;
  onUpdateCard: (updated: Partial<VirtualCardDetails>) => Promise<void>;
  transactions: Transaction[];
  onOpenDeposit: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onOpenKyc: () => void;
  sandbox: boolean;
  onChanged: () => void;
}

export const VirtualCardSection: React.FC<VirtualCardSectionProps> = ({
  card,
  user,
  onUpdateCard,
  transactions,
  onOpenDeposit,
  onSelectTransaction,
  sandbox,
  onChanged,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [secret, setSecret] = useState<{ cardNumber: string; cvv: string } | null>(null);
  const [hidden, setHidden] = useState(false); // optional privacy mask chosen by the cardholder
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [limitSlider, setLimitSlider] = useState(card.monthlySpendLimitMWK);
  const [sim, setSim] = useState({ merchant: 'Netflix', amountMWK: '24000', country: 'NL', mcc: '' });
  const [simResult, setSimResult] = useState<string | null>(null);

  // Full card details are always visible to the verified cardholder (no hidden digits).
  useEffect(() => { api.cardDetails().then(setSecret).catch((e) => setActionError(errMsg(e))); }, [card.id]);
  const showSensitiveData = !hidden && !!secret;
  const shown = { cardNumber: secret?.cardNumber ?? card.cardNumber, cvv: secret?.cvv ?? '•••' };
  const idLabel = user.idType === 'PASSPORT' ? 'PASSPORT' : user.idType === 'DRIVING_LICENCE' ? 'DL' : 'NRB';
  const run = async (fn: () => Promise<unknown>) => { setActionError(null); try { await fn(); } catch (e) { setActionError(errMsg(e)); } };

  const cardTransactions = transactions.filter((tx) => tx.channel === 'VIRTUAL_CARD' || tx.type === 'CARD_PAYMENT');

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleToggleSensitive = () => setHidden((h) => !h);

  // PIN is required only to regenerate the CVV
  const handleRegenerateCvv = () => { setEnteredPin(''); setPinError(null); setPinPromptOpen(true); };
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault(); setPinError(null);
    try {
      const r = await api.rotateCvv(enteredPin);
      setSecret((x) => (x ? { ...x, cvv: r.cvv } : x)); setPinPromptOpen(false); setEnteredPin(''); handleCopy(r.cvv, 'CVV regenerated');
    } catch (er) { setPinError(errMsg(er)); }
  };

  const runSim = async (e: React.FormEvent) => {
    e.preventDefault(); setSimResult(null);
    try {
      const r = await api.simulatePurchase({ merchant: sim.merchant, amountMWK: Number(sim.amountMWK), country: sim.country, mcc: sim.mcc || undefined });
      setSimResult(r.approved ? 'Approved: payment completed' : `Declined: ${r.reason}`); onChanged();
      api.cardDetails().then(setSecret).catch(() => {});
    } catch (er) { setSimResult(errMsg(er)); }
  };

  const handleToggleFreeze = () => run(() => onUpdateCard({ status: card.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE' }));

  const handleSaveLimit = () => run(() => onUpdateCard({ monthlySpendLimitMWK: limitSlider }));

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header text */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Visual Virtual Debit & Credit Card
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Linked to your verified Malawi National ID profile (<span className="font-mono text-slate-300">{idLabel}: {user.nationalIdNumber}</span>). All mobile deposits instantly fund this card for domestic and global checkout.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsFlipped(!isFlipped)}
            className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Flip Card {isFlipped ? '(Front)' : '(Back)'}</span>
          </button>
          
          <button
            onClick={handleToggleSensitive}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
              showSensitiveData 
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' 
                : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
            }`}
          >
            {showSensitiveData ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hide numbers</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Show numbers</span>
              </>
            )}
          </button>
        </div>
      </div>

      {actionError && <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300">{actionError}</div>}

      {/* Main Grid: Visual 3D Card on Left, Card Controls on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 3D Flip Card */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-md perspective-1000">
            <div 
              className={`relative w-full aspect-[1.586/1] rounded-2xl transition-transform duration-700 transform-style-3d cursor-pointer shadow-2xl ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
              onClick={() => setIsFlipped(!isFlipped)}
            >
              {/* CARD FRONT */}
              <div className={`absolute inset-0 w-full h-full rounded-2xl p-6 flex flex-col justify-between backface-hidden border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-950 text-white overflow-hidden ${
                card.status === 'FROZEN' ? 'filter grayscale contrast-125' : ''
              }`}>
                {/* Holographic metallic sheen overlay */}
                <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-gradient-to-br from-emerald-400/15 via-teal-300/10 to-transparent blur-2xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-tl from-amber-400/10 to-transparent blur-2xl pointer-events-none" />
                
                {/* Top Row: Brand & Status */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center font-black text-slate-950 text-xs">
                      NV
                    </div>
                    <div>
                      <span className="font-bold tracking-wider text-sm">NyasaVault</span>
                      <span className="text-[9px] uppercase tracking-widest text-emerald-300/80 block">Malawi Platinum</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {card.status === 'FROZEN' ? (
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-rose-400 bg-rose-950/80 border border-rose-800/80 px-2 py-0.5 rounded">
                        FROZEN
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-emerald-300 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                        ACTIVE
                      </span>
                    )}
                    <span className="text-xs font-mono font-bold tracking-wider text-slate-300">
                      VISA
                    </span>
                  </div>
                </div>

                {/* Middle Row: Chip & Contactless */}
                <div className="relative z-10 flex items-center justify-between my-auto">
                  <div className="flex items-center gap-4">
                    {/* Realistic Gold EMV Smart Chip */}
                    <div className="w-11 h-9 rounded-md bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 p-0.5 shadow-md flex flex-col justify-around border border-amber-300">
                      <div className="w-full h-px bg-amber-700/60" />
                      <div className="w-full h-px bg-amber-700/60" />
                      <div className="w-full h-px bg-amber-700/60" />
                    </div>

                    {/* Contactless Wave Glyph */}
                    <div className="text-slate-400">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8.5 16.5a5 5 0 0 1 0-7" />
                        <path d="M12 19a8.5 8.5 0 0 1 0-12" />
                        <path d="M15.5 21.5a12 12 0 0 1 0-17" />
                      </svg>
                    </div>
                  </div>

                  {/* Watermark of verified NRB National ID */}
                  <div className="text-right">
                    <span className="text-[9px] uppercase tracking-wider text-emerald-400/90 font-mono block">
                      {idLabel}: {user.nationalIdNumber}
                    </span>
                    <span className="text-[8px] text-slate-400 tracking-wider uppercase block">
                      KYC VERIFIED
                    </span>
                  </div>
                </div>

                {/* Bottom Row: Card Number, Expiry, Name */}
                <div className="relative z-10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-lg sm:text-xl font-bold tracking-[0.2em] text-slate-100 drop-shadow">
                      {formatCardNumber(shown.cardNumber, showSensitiveData)}
                    </span>
                    {showSensitiveData && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(shown.cardNumber, 'Card number');
                        }}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Copy full 16-digit card number"
                      >
                        {copiedField === 'Card number' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  <div className="flex items-end justify-between text-xs pt-1 border-t border-white/10">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Cardholder</div>
                      <div className="font-semibold tracking-wider uppercase text-slate-200">
                        {card.cardHolder}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-400">Expires</div>
                        <div className="font-mono font-medium text-slate-200">
                          {card.expiryMonth}/{card.expiryYear}
                        </div>
                      </div>

                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-400">CVV</div>
                        <div className="font-mono font-medium text-slate-200">
                          {showSensitiveData ? shown.cvv : '•••'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD BACK */}
              <div className={`absolute inset-0 w-full h-full rounded-2xl flex flex-col justify-between backface-hidden rotate-y-180 border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 text-white overflow-hidden ${
                card.status === 'FROZEN' ? 'filter grayscale contrast-125' : ''
              }`}>
                {/* Magnetic Stripe */}
                <div className="w-full h-11 bg-slate-950 border-y border-slate-800 mt-4" />

                {/* Signature Strip & CVV */}
                <div className="px-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-8 bg-slate-100 rounded px-3 flex items-center justify-between text-slate-800">
                      <span className="font-serif italic text-sm tracking-widest text-slate-700 select-none">
                        {user.fullName}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">
                        {idLabel} {user.nationalIdNumber}
                      </span>
                    </div>

                    <div className="bg-slate-900 border border-slate-700 rounded px-3 py-1 text-center">
                      <span className="text-[8px] uppercase tracking-wider text-slate-400 block">CVV</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        {showSensitiveData ? shown.cvv : '•••'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[8px] leading-tight text-slate-400">
                    Virtual card issued to the verified holder named on the front. Report loss or fraud immediately using Emergency Freeze in the Security tab.
                  </p>
                </div>

                {/* Back Footer */}
                <div className="px-6 pb-4 flex items-center justify-between text-[9px] text-slate-400 border-t border-slate-800 pt-2">
                  <span>Customer Care: +265 (0) 1 772 400</span>
                  <span className="font-mono">Lilongwe, Malawi</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action under Card */}
          <div className="w-full max-w-md mt-4 flex items-center justify-between text-xs text-slate-400 px-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>3D Secure 2.2 Enabled</span>
            </span>
            <button
              onClick={() => setIsFlipped(!isFlipped)}
              className="text-emerald-400 hover:text-emerald-300 font-medium"
            >
              Click card or tap here to flip
            </button>
          </div>

          {/* Card Balance Callout */}
          <div className="w-full max-w-md mt-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Card Available Balance</span>
                <span className="text-xl font-bold font-mono text-white tabular-nums">
                  {formatMWK(card.balanceMWK)}
                </span>
                <span className="text-xs text-slate-400 block font-mono">
                  ~ {formatUSD(card.balanceMWK / 1750)} USD
                </span>
              </div>
              <button
                onClick={onOpenDeposit}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors cursor-pointer"
              >
                + Fund Card
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Card Controls & Compliance Security */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>Card Security & Spending Controls</span>
            </h2>

            {/* Control 1: Freeze / Unfreeze */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="pr-4">
                <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  {card.status === 'FROZEN' ? <Lock className="w-4 h-4 text-rose-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                  <span>{card.status === 'FROZEN' ? 'Card is Frozen' : 'Card is Active'}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Instant lock preventing all physical and online transactions.
                </p>
              </div>
              <button
                onClick={handleToggleFreeze}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  card.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    card.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Control 2: International Transactions */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="pr-4">
                <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-teal-400" />
                  <span>International Payments (USD)</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Allows payments on Netflix, Amazon, AliExpress, Google Play, Steam, Coursera.
                </p>
              </div>
              <button
                onClick={() => run(() => onUpdateCard({ allowInternational: !card.allowInternational }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  card.allowInternational ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    card.allowInternational ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Control 3: Disposable Burner Mode */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="pr-4">
                <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Disposable Burner Mode</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  CVV auto-regenerates after every payment to prevent merchant re-billing and identity theft.
                </p>
              </div>
              <button
                onClick={() => run(() => onUpdateCard({ isBurnerMode: !card.isBurnerMode }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  card.isBurnerMode ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    card.isBurnerMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Control 4: Monthly Spending Limit Slider */}
            <div className="space-y-3 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">
                  Monthly Limit: {formatMWK(limitSlider)}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Spent: {formatMWK(card.currentMonthSpentMWK)}
                </span>
              </div>
              <input
                type="range"
                min="500000"
                max="5000000"
                step="250000"
                value={limitSlider}
                onChange={(e) => setLimitSlider(Number(e.target.value))}
                onMouseUp={handleSaveLimit}
                onTouchEnd={handleSaveLimit}
                className="w-full accent-emerald-500 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>MWK 500,000</span>
                <span>Max Tier 2 (MWK 5,000,000)</span>
              </div>
            </div>

            {/* Regenerate CVV Quick Button */}
            <div className="pt-2 flex items-center justify-between text-xs">
              <button
                onClick={handleRegenerateCvv}
                className="text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Regenerate Dynamic CVV</span>
              </button>

              <button
                onClick={() => handleCopy(`${shown.cardNumber} | Exp: ${card.expiryMonth}/${card.expiryYear} | CVV: ${shown.cvv}`, 'All details')}
                className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                {copiedField === 'All details' ? 'Copied to Clipboard!' : 'Copy Checkout Bundle'}
              </button>
            </div>
          </div>

          {/* KYC Regulatory Safety Notice */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Card safety</span>
            </div>
            <p>
              Your card was issued only after your identity was verified. Freeze it instantly, set spending limits and block gambling or international payments from the controls above.
            </p>
          </div>
        </div>
      </div>

      {/* Card Transactions Ledger */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <span>Virtual Card Payment History</span>
          </h2>
          <span className="text-xs text-slate-400">
            Real-time FX conversions (USD to MWK)
          </span>
        </div>

        {cardTransactions.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-sm text-slate-400">
            No card payments yet. Deposit money via Airtel/TNM to use this card on global websites.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Auth Ref</th>
                  <th className="px-4 py-3 text-right">USD Equivalent</th>
                  <th className="px-4 py-3 text-right">Amount Billed</th>
                  <th className="px-4 py-3 text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {cardTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-sans font-medium text-slate-200">
                      <div>{tx.title}</div>
                      <div className="text-[11px] text-slate-400">{tx.recipientOrMerchant}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{tx.timestamp}</td>
                    <td className="px-4 py-3 text-slate-400">{tx.operatorReference}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                      {tx.equivalentUSD ? formatUSD(tx.equivalentUSD) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-400 tabular-nums">
                      - {formatMWK(tx.amountMWK)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onSelectTransaction(tx)}
                        className="text-emerald-400 hover:text-emerald-300 p-1 cursor-pointer"
                        title="View Official Receipt"
                      >
                        <Receipt className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sandbox && (
        <form onSubmit={runSim} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-3">
          <div className="text-xs font-semibold text-amber-200">Sandbox: simulate a merchant payment to test your card controls</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <input className="col-span-2 px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white" value={sim.merchant} onChange={(e) => setSim({ ...sim, merchant: e.target.value })} aria-label="Merchant" />
            <input className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono" value={sim.amountMWK} onChange={(e) => setSim({ ...sim, amountMWK: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Amount MWK" />
            <select className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white" value={sim.country} onChange={(e) => setSim({ ...sim, country: e.target.value })} aria-label="Merchant country"><option value="MW">Malawi</option><option value="NL">Netherlands</option><option value="US">USA</option></select>
            <select className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white" value={sim.mcc} onChange={(e) => setSim({ ...sim, mcc: e.target.value })} aria-label="Merchant type"><option value="">Normal</option><option value="7995">Gambling</option></select>
          </div>
          <div className="flex items-center gap-3"><button className="px-3 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer">Simulate payment</button>{simResult && <span className="text-xs text-slate-200">{simResult}</span>}</div>
        </form>
      )}

      {/* PIN Prompt Modal for revealing sensitive card number and CVV */}
      {pinPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Security Verification</h3>
                <p className="text-xs text-slate-400">Enter your 4-digit Transaction PIN to generate a new CVV</p>
              </div>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-4">
              <div>
                <input
                  type="password"
                  maxLength={4}
                  autoFocus
                  placeholder="••••"
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-[0.5em] font-mono text-2xl py-3 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
                {pinError && (
                  <p className="text-xs text-rose-400 mt-1 text-center">{pinError}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPinPromptOpen(false)}
                  className="w-1/2 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enteredPin.length < 4}
                  className="w-1/2 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  Verify & Regenerate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
