import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Smartphone, 
  Building2, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  PhoneCall, 
  Lock, 
  Info,
  Radio
} from 'lucide-react';
import { TelcoProvider, UserKycProfile, Transaction, ChannelCaps } from '../types';
import { MALAWI_BANKS } from '../../shared/banks';
import { MIN_DEPOSIT_MWK, MIN_WITHDRAWAL_MWK } from '../../shared/fees';
import { api, errMsg } from '../lib/api';
import { formatMWK, calculateWithdrawalFee } from '../utils/formatters';

interface MobileMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserKycProfile;
  currentBalanceMWK: number;
  initialMode?: 'DEPOSIT' | 'WITHDRAW';
  channels: Record<TelcoProvider, ChannelCaps>;
  sandbox: boolean;
}

export const MobileMoneyModal: React.FC<MobileMoneyModalProps> = ({
  isOpen,
  onClose,
  user,
  currentBalanceMWK,
  initialMode = 'DEPOSIT',
  channels,
  sandbox,
}) => {
  const [mode, setMode] = useState<'DEPOSIT' | 'WITHDRAW'>(initialMode);
  const [provider, setProvider] = useState<TelcoProvider>('AIRTEL_MONEY');
  const [amount, setAmount] = useState<string>('50000');
  const [phoneNumber, setPhoneNumber] = useState<string>(user.phoneNumber);
  const [selectedBank, setSelectedBank] = useState<string>(MALAWI_BANKS[0].id);
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>(user.fullName);

  // Push simulation states
  const [isPushPrompting, setIsPushPrompting] = useState<boolean>(false);
  const [simulatedPin, setSimulatedPin] = useState<string>('');
  const [pushStatus, setPushStatus] = useState<'IDLE' | 'AWAITING_PIN' | 'PROCESSING' | 'SUCCESS'>('IDLE');
  const [successReference, setSuccessReference] = useState<string>('');

  // Withdrawal PIN verification
  const [withdrawPin, setWithdrawPin] = useState<string>('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [pending, setPending] = useState<Transaction | null>(null);
  const idem = useRef(crypto.randomUUID());
  const canUse = (p: TelcoProvider) => (mode === 'DEPOSIT' ? channels[p]?.deposit : channels[p]?.withdraw);

  // Pick a usable channel whenever the mode changes
  useEffect(() => {
    if (!canUse(provider)) { const first = (['AIRTEL_MONEY', 'TNM_MPAMBA', 'BANK_TRANSFER'] as TelcoProvider[]).find(canUse); if (first) setProvider(first); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, channels, isOpen]);

  // Poll the server until the mobile-money prompt is approved, declined or times out
  useEffect(() => {
    if (!pending || pending.status !== 'PENDING') return;
    const started = Date.now();
    const t = setInterval(async () => {
      try {
        const tx = await api.transaction(pending.id); setPending(tx);
        if (tx.status === 'COMPLETED') { setSuccessReference(tx.operatorReference); setPushStatus('SUCCESS'); }
        else if (tx.status === 'FAILED') setDepositError('The payment was declined or not approved on your phone.');
      } catch { /* keep polling */ }
      if (Date.now() - started > 180_000) { clearInterval(t); setDepositError('We have not received your approval yet. If you already approved, your balance will update automatically.'); }
    }, 2000);
    return () => clearInterval(t);
  }, [pending]);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const withdrawalFee = calculateWithdrawalFee(numAmount, provider);

  const handleStartDeposit = async (e: React.FormEvent) => {
    e.preventDefault(); setDepositError(null);
    if (numAmount < MIN_DEPOSIT_MWK) { setDepositError(`Minimum deposit is MWK ${MIN_DEPOSIT_MWK.toLocaleString('en-US')}`); return; }
    setBusy(true);
    try {
      const tx = await api.deposit({ amountMWK: numAmount, provider, phone: phoneNumber.replace(/\s/g, '') }, idem.current);
      setPending(tx); setIsPushPrompting(true); setPushStatus('AWAITING_PIN');
      if (tx.status === 'COMPLETED') { setSuccessReference(tx.operatorReference); setPushStatus('SUCCESS'); }
    } catch (err) { setDepositError(errMsg(err)); } finally { setBusy(false); }
  };

  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault(); setWithdrawError(null);
    if (numAmount < MIN_WITHDRAWAL_MWK) { setWithdrawError(`Minimum withdrawal is MWK ${MIN_WITHDRAWAL_MWK.toLocaleString('en-US')}`); return; }
    if (withdrawalFee.netDebit > currentBalanceMWK) {
      setWithdrawError(`Insufficient balance. Total deduction including withdrawal fee is ${formatMWK(withdrawalFee.netDebit)}, but your balance is ${formatMWK(currentBalanceMWK)}.`);
      return;
    }
    setBusy(true);
    try {
      const tx = await api.withdraw({ amountMWK: numAmount, provider, phone: phoneNumber.replace(/\s/g, ''), bankId: selectedBank, accountNumber, accountName, pin: withdrawPin }, idem.current);
      if (tx.status === 'FAILED') { setWithdrawError(tx.description); setWithdrawPin(''); idem.current = crypto.randomUUID(); }
      else { setSuccessReference(tx.operatorReference); setPushStatus('SUCCESS'); }
    } catch (err) { setWithdrawError(errMsg(err)); setWithdrawPin(''); idem.current = crypto.randomUUID(); } finally { setBusy(false); }
  };

  const resetAll = () => {
    setIsPushPrompting(false); setPushStatus('IDLE'); setSuccessReference(''); setWithdrawPin(''); setWithdrawError(null);
    setDepositError(null); setPending(null); idem.current = crypto.randomUUID();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Malawi Mobile Money & Banking</h3>
              <p className="text-xs text-slate-400">Reserve Bank of Malawi Clearing System</p>
            </div>
          </div>
          <button 
            onClick={resetAll}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Screen */}
        {pushStatus === 'SUCCESS' ? (
          <div className="p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            
            <div>
              <h4 className="text-xl font-bold text-white">
                {mode === 'DEPOSIT' ? 'Deposit received!' : 'Withdrawal processed!'}
              </h4>
              <p className="text-sm text-slate-300 mt-1">
                {mode === 'DEPOSIT' ? (
                  <>
                    <span className="font-semibold text-emerald-400">{formatMWK(numAmount)}</span> has been credited to your NyasaVault wallet and is available on your virtual card.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-rose-400">{formatMWK(numAmount)}</span> has been transferred. A fee of <span className="text-amber-400">{formatMWK(withdrawalFee.totalFee)}</span> was charged.
                  </>
                )}
              </p>
            </div>

            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-1.5 text-left">
              <div className="flex justify-between text-slate-400">
                <span>Telco Operator:</span>
                <span className="text-slate-200">
                  {provider === 'AIRTEL_MONEY' ? 'Airtel Money Malawi' : provider === 'TNM_MPAMBA' ? 'TNM Mpamba' : 'NatSwitch Interbank'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Reference Code:</span>
                <span className="text-emerald-400 font-bold">{successReference}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Time:</span>
                <span className="text-slate-200">Just Now</span>
              </div>
            </div>

            <button
              onClick={resetAll}
              className="w-full py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : isPushPrompting ? (
          /* Live USSD / STK Push Simulation */
          <div className="p-6 space-y-6">
            <div className={`p-4 rounded-xl border ${
              provider === 'AIRTEL_MONEY' 
                ? 'bg-rose-950/30 border-rose-800/50' 
                : 'bg-emerald-950/30 border-emerald-800/50'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm ${
                  provider === 'AIRTEL_MONEY' ? 'bg-red-600' : 'bg-emerald-600'
                }`}>
                  {provider === 'AIRTEL_MONEY' ? 'airtel' : 'TNM'}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {provider === 'AIRTEL_MONEY' ? 'Airtel Money Push Request' : 'TNM Mpamba USSD Prompt'}
                  </h4>
                  <p className="text-xs text-slate-300">
                    Sent to {phoneNumber}
                  </p>
                </div>
              </div>
            </div>

            <div className="py-4 text-center space-y-4">
              {depositError ? (
                <>
                  <AlertCircle className="w-9 h-9 text-amber-400 mx-auto" />
                  <p className="text-sm text-slate-200">{depositError}</p>
                  <button onClick={() => { setIsPushPrompting(false); setPending(null); setDepositError(null); setPushStatus('IDLE'); idem.current = crypto.randomUUID(); }} className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-lg cursor-pointer">Back</button>
                </>
              ) : (
                <>
                  <div className="w-9 h-9 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <div>
                    <p className="text-sm font-bold text-white">Check your phone</p>
                    <p className="text-xs text-slate-300 mt-1">Approve the <b>{formatMWK(numAmount)}</b> request by entering your {provider === 'AIRTEL_MONEY' ? 'Airtel Money' : 'TNM Mpamba'} PIN on your handset. Never share that PIN with anyone, including NyasaVault.</p>
                  </div>
                  {sandbox && <p className="text-[11px] text-amber-300">Sandbox: no prompt is sent. It approves automatically in a few seconds (numbers ending 0000 are declined).</p>}
                  <button onClick={resetAll} className="text-xs text-slate-400 hover:text-white cursor-pointer">Close. We will keep checking and update your balance.</button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Main Deposit / Withdraw Form */
          <div className="p-6 space-y-6">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setMode('DEPOSIT')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mode === 'DEPOSIT' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Deposit Money</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('WITHDRAW')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mode === 'WITHDRAW' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Withdraw Funds</span>
              </button>
            </div>

            {/* Provider Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                {mode === 'DEPOSIT' ? 'Deposit Method (Telco / Bank)' : 'Withdrawal Destination'}
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                {/* Airtel Money */}
                <button
                  type="button"
                  disabled={!canUse('AIRTEL_MONEY')} onClick={() => setProvider('AIRTEL_MONEY')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    provider === 'AIRTEL_MONEY'
                      ? 'bg-rose-950/40 border-rose-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="w-6 h-6 rounded-md bg-red-600 text-white flex items-center justify-center font-bold text-[10px] mb-2">
                    AM
                  </div>
                  <div className="text-xs font-bold text-slate-200">Airtel Money</div>
                  <div className="text-[10px] text-slate-400">+265 99x/98x</div>
                </button>

                {/* TNM Mpamba */}
                <button
                  type="button"
                  disabled={!canUse('TNM_MPAMBA')} onClick={() => setProvider('TNM_MPAMBA')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    provider === 'TNM_MPAMBA'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] mb-2">
                    MP
                  </div>
                  <div className="text-xs font-bold text-slate-200">TNM Mpamba</div>
                  <div className="text-[10px] text-slate-400">+265 88x/80x</div>
                </button>

                {/* Commercial Bank */}
                <button
                  type="button"
                  disabled={!canUse('BANK_TRANSFER')} onClick={() => setProvider('BANK_TRANSFER')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    provider === 'BANK_TRANSFER'
                      ? 'bg-blue-950/40 border-blue-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] mb-2">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs font-bold text-slate-200">Malawi Bank</div>
                  <div className="text-[10px] text-slate-400">NBM, Stb, FDH</div>
                </button>
              </div>
            </div>

            {/* Form Fields */}
            {mode === 'DEPOSIT' ? (
              <form onSubmit={handleStartDeposit} className="space-y-4">
                {/* Amount */}
                <div>
                  <div className="flex justify-between items-center mb-1 text-xs">
                    <label className="font-medium text-slate-300">Amount (MWK)</label>
                    <span className="text-slate-400">Min: MWK 1,000</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-emerald-400">MWK</span>
                    <input
                      type="number"
                      required
                      min="1000"
                      max="5000000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-14 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-semibold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  {/* Shortcut chips */}
                  <div className="flex gap-2 mt-2">
                    {['25000', '50000', '150000', '500000'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmount(preset)}
                        className="px-2.5 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 cursor-pointer"
                      >
                        {formatMWK(Number(preset)).replace('.00', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Telco Phone or Bank Details */}
                {provider === 'BANK_TRANSFER' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Select Bank</label>
                      <select
                        value={selectedBank}
                        onChange={(e) => setSelectedBank(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                      >
                        {MALAWI_BANKS.map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            {bank.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
                      Transfer MWK to NyasaVault Corporate Account via your mobile banking app or NatSwitch. Use Reference: <span className="text-emerald-400 font-mono font-semibold">NV-{user.nationalIdNumber}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {provider === 'AIRTEL_MONEY' ? 'Airtel Money Phone Number' : 'TNM Mpamba Phone Number'}
                    </label>
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+265 991 482 109"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      A payment request will be sent to this handset. You approve it with your mobile money PIN.
                    </p>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/50 text-xs text-slate-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p>
                    Deposits are credited to your NyasaVault wallet and are instantly spendable with your virtual card once you are verified.
                  </p>
                </div>

                {depositError && !isPushPrompting && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{depositError}</span></div>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 text-xs font-bold uppercase tracking-wider text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 rounded-lg shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  {busy ? 'Sending request…' : 'Send Payment Request'}
                </button>
              </form>
            ) : (
              /* WITHDRAWAL FLOW - Includes the requested explicit charges for third-party bank accounts or peer-to-peer wallets! */
              <form onSubmit={handleExecuteWithdrawal} className="space-y-4">
                {/* Available balance notice */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Available Balance:</span>
                  <span className="font-mono font-bold text-white tabular-nums">{formatMWK(currentBalanceMWK)}</span>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Withdrawal Amount (MWK)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-amber-400">MWK</span>
                    <input
                      type="number"
                      required
                      min="2000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-14 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Destination info */}
                {provider === 'BANK_TRANSFER' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Select Malawi Bank</label>
                      <select
                        value={selectedBank}
                        onChange={(e) => setSelectedBank(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                      >
                        {MALAWI_BANKS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.shortName})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Account Number</label>
                        <input
                          type="text"
                          required
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Account Name</label>
                        <input
                          type="text"
                          required
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Recipient Mobile Money Number ({provider === 'AIRTEL_MONEY' ? 'Airtel' : 'TNM'})
                    </label>
                    <input
                      type="text"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Explicit Transparent Withdrawal Fee Breakdown */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-900/40 text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Withdrawal Fee Rate:</span>
                    <span className="text-amber-400 font-medium">{withdrawalFee.feeRateText}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Third-Party Operator Fee:</span>
                    <span className="font-mono text-slate-200 tabular-nums">{formatMWK(withdrawalFee.operatorFee)}</span>
                  </div>
                  {withdrawalFee.clearingFee > 0 && (
                    <div className="flex items-center justify-between text-slate-400">
                      <span>RBM NatSwitch Interbank Fee:</span>
                      <span className="font-mono text-slate-200 tabular-nums">{formatMWK(withdrawalFee.clearingFee)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-800 pt-2 flex items-center justify-between font-semibold">
                    <span className="text-slate-300">Total Account Debit:</span>
                    <span className="font-mono text-rose-400 tabular-nums">{formatMWK(withdrawalFee.netDebit)}</span>
                  </div>
                </div>

                {/* 4-digit Security PIN */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Enter 4-Digit Security PIN to Authorize:
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={withdrawPin}
                    onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[0.5em] font-mono text-lg py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {withdrawError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{withdrawError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || withdrawPin.length < 4 || numAmount <= 0}
                  className="w-full py-3 text-xs font-bold uppercase tracking-wider text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  Confirm Withdrawal (-{formatMWK(withdrawalFee.netDebit)})
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
