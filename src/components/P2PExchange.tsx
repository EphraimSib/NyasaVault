import React, { useEffect, useState } from 'react';
import { 
  ArrowLeftRight, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Send, 
  Plus, 
  X, 
  AlertTriangle, 
  Lock, 
  MessageSquare, 
  UserCheck, 
  Filter,
  Check,
  Copy
} from 'lucide-react';
import { P2POffer, P2PTradeOrder, TelcoProvider, UserKycProfile } from '../types';
import { formatMWK, formatUSD } from '../utils/formatters';
import { api, errMsg } from '../lib/api';

interface P2PExchangeProps {
  offers: P2POffer[];
  orders: P2PTradeOrder[];
  user: UserKycProfile;
  sandbox: boolean;
  ttlMinutes: number;
  onChanged: () => void;
  onOpenKyc: () => void;
}

const TERMINAL = ['ESCROW_RELEASED', 'CANCELLED'];

export const P2PExchange: React.FC<P2PExchangeProps> = ({ offers, orders, user, ttlMinutes, onChanged, onOpenKyc }) => {
  const [activeTab, setActiveTab] = useState<'BUY' | 'SELL'>('BUY');
  const [selectedCrypto, setSelectedCrypto] = useState<'USDT' | 'BTC' | 'USDC'>('USDT');
  const [selectedPayment, setSelectedPayment] = useState<string>('ALL');

  // Trade Room state
  const [activeOrder, setActiveOrder] = useState<P2PTradeOrder | null>(null);
  const [tradeAmountMWK, setTradeAmountMWK] = useState<string>('50000');
  const [selectedOfferForTrade, setSelectedOfferForTrade] = useState<P2POffer | null>(null);
  const [paymentRefInput, setPaymentRefInput] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [releasePin, setReleasePin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tradeMethod, setTradeMethod] = useState<TelcoProvider>('AIRTEL_MONEY');
  const [sellerDetails, setSellerDetails] = useState('');
  const [nowTs, setNowTs] = useState(Date.now());
  const verified = user.kycTier >= 2;
  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);

  // Post Offer Modal
  const [postOfferOpen, setPostOfferOpen] = useState(false);
  const [offerType, setOfferType] = useState<'BUY' | 'SELL'>('SELL');
  const [offerPrice, setOfferPrice] = useState<string>('');
  const [offerAmountCrypto, setOfferAmountCrypto] = useState<string>('200');
  const [offerMinLimit, setOfferMinLimit] = useState<string>('25000');
  const [offerMaxLimit, setOfferMaxLimit] = useState<string>('350000');
  const [offerPaymentDetails, setOfferPaymentDetails] = useState<string>(
    `Airtel Money (${user.phoneNumber}) or TNM Mpamba. Instant release.`
  );

  const filteredOffers = offers.filter((offer) => {
    // If activeTab is BUY, we show offers where maker is SELLING
    const matchesType = activeTab === 'BUY' ? offer.type === 'SELL' : offer.type === 'BUY';
    const matchesCrypto = offer.cryptoSymbol === selectedCrypto;
    const matchesPayment = selectedPayment === 'ALL' || offer.paymentMethods.includes(selectedPayment as TelcoProvider);
    return matchesType && matchesCrypto && matchesPayment;
  });

  // live-refresh an open order (chat, status) and tick the countdown
  useEffect(() => {
    if (!activeOrder) return;
    const id = activeOrder.id;
    const poll = setInterval(() => { api.p2pOrder(id).then((o) => setActiveOrder((cur) => (cur && cur.id === id ? o : cur))).catch(() => {}); }, 3000);
    const tick = setInterval(() => setNowTs(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [activeOrder?.id]);

  const guard = async (fn: () => Promise<unknown>) => { setError(null); setBusy(true); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };
  const refreshOrder = async (id: string) => { setActiveOrder(await api.p2pOrder(id)); onChanged(); };

  const handleStartTrade = (offer: P2POffer) => {
    if (!verified) { onOpenKyc(); return; }
    setError(null); setSelectedOfferForTrade(offer); setTradeAmountMWK(String(offer.minLimitMWK)); setTradeMethod(offer.paymentMethods[0]); setSellerDetails('');
  };

  const handleConfirmOrder = () => guard(async () => {
    if (!selectedOfferForTrade) return;
    const o = await api.createOrder({ offerId: selectedOfferForTrade.id, amountMWK: parseFloat(tradeAmountMWK) || 0, method: tradeMethod, paymentDetails: sellerDetails || undefined });
    setSelectedOfferForTrade(null); setActiveOrder(o); onChanged();
  });
  const handleMarkAsPaid = () => guard(async () => { await api.markPaid(activeOrder!.id, paymentRefInput.trim()); setPaymentRefInput(''); await refreshOrder(activeOrder!.id); });
  const handleReleaseEscrow = () => guard(async () => { await api.release(activeOrder!.id, releasePin); setReleasePin(''); await refreshOrder(activeOrder!.id); });
  const handleCancel = () => guard(async () => { await api.cancelOrder(activeOrder!.id); await refreshOrder(activeOrder!.id); });
  const handleDispute = () => { const reason = window.prompt('Describe the problem (e.g. money not received)'); if (reason) guard(async () => { await api.disputeOrder(activeOrder!.id, reason); await refreshOrder(activeOrder!.id); }); };
  const handleSendChat = (e: React.FormEvent) => { e.preventDefault(); if (!chatInput.trim() || !activeOrder) return; const text = chatInput; setChatInput(''); guard(async () => { await api.sendMessage(activeOrder.id, text); await refreshOrder(activeOrder.id); }); };

  const handleCreateOfferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    guard(async () => {
      await api.createOffer({ type: offerType, cryptoSymbol: 'USDT', priceMWK: parseFloat(offerPrice), amountCrypto: parseFloat(offerAmountCrypto), minLimitMWK: parseFloat(offerMinLimit), maxLimitMWK: parseFloat(offerMaxLimit), paymentMethods: ['AIRTEL_MONEY', 'TNM_MPAMBA'], paymentDetails: offerPaymentDetails });
      setPostOfferOpen(false); onChanged();
    });
  };
  const countdown = (o: P2PTradeOrder) => { const sec = Math.max(0, Math.round((new Date(o.expiresAt).getTime() - nowTs) / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const openOrders = orders.filter((o) => !TERMINAL.includes(o.status));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* P2P Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ArrowLeftRight className="w-6 h-6 text-emerald-400" />
            <span>Malawi P2P Crypto & Mobile Money Exchange</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Trade MWK directly with verified Malawian peers using Airtel Money, TNM Mpamba, or NatSwitch bank transfer with automated smart escrow.
          </p>
        </div>

        <button
          onClick={() => (verified ? setPostOfferOpen(true) : onOpenKyc())}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-md transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Post New P2P Offer</span>
        </button>
      </div>

      {error && !selectedOfferForTrade && !activeOrder && !postOfferOpen && <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300">{error}</div>}
      {!verified && <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200">P2P trading needs a verified identity. <button onClick={onOpenKyc} className="underline font-semibold cursor-pointer">Verify now</button></div>}
      {openOrders.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-emerald-900/50 space-y-2">
          <div className="text-xs font-semibold text-emerald-300">Your open trades</div>
          {openOrders.map((o) => (
            <button key={o.id} onClick={() => setActiveOrder(o)} className="w-full flex items-center justify-between text-left text-xs p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-700 cursor-pointer">
              <span className="text-slate-200">{o.role === 'BUYER' ? 'Buying' : 'Selling'} {o.cryptoAmount} {o.cryptoSymbol} · {formatMWK(o.totalMWK)} · {o.counterpartyName}</span>
              <span className="font-mono text-amber-300">{o.status === 'PENDING_PAYMENT' ? `Pay in ${countdown(o)}` : o.status === 'PAYMENT_SENT' ? 'Awaiting release' : o.status}</span>
            </button>))}
        </div>
      )}

      {/* Main Trading Floor Tabs & Filters */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Buy / Sell Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('BUY')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'BUY'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Buy Crypto (Pay MWK)
            </button>
            <button
              onClick={() => setActiveTab('SELL')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'SELL'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sell Crypto (Receive MWK)
            </button>
          </div>

          {/* Crypto Asset Selector */}
          <div className="flex items-center gap-2">
            {(['USDT', 'BTC', 'USDC'] as const).map((sym) => (
              <button
                key={sym}
                onClick={() => setSelectedCrypto(sym)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  selectedCrypto === sym
                    ? 'bg-slate-800 text-white border-emerald-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Payment Method Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Payment:</span>
            <select
              value={selectedPayment}
              onChange={(e) => setSelectedPayment(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Malawi Methods</option>
              <option value="AIRTEL_MONEY">Airtel Money Only</option>
              <option value="TNM_MPAMBA">TNM Mpamba Only</option>
              <option value="BANK_TRANSFER">Bank NatSwitch Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Offers Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Trader & Verification</th>
              <th className="px-4 py-3">Price / Unit</th>
              <th className="px-4 py-3">Available / Limits</th>
              <th className="px-4 py-3">Payment Methods</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans text-xs">
            {filteredOffers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No active P2P offers match your criteria. Click "Post New P2P Offer" to create the first one!
                </td>
              </tr>
            ) : (
              filteredOffers.map((offer) => (
                <tr key={offer.id} className="hover:bg-slate-800/40 transition-colors">
                  {/* Trader */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 text-xs">
                        {offer.userName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <span>{offer.userName}</span>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {offer.tradesCount} trades · {offer.userRating}% completion
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3.5 font-mono text-sm font-bold text-white tabular-nums">
                    {formatMWK(offer.priceMWK)}
                    <span className="text-[10px] text-slate-400 font-normal block font-sans">
                      per {offer.cryptoSymbol}
                    </span>
                  </td>

                  {/* Available & Limits */}
                  <td className="px-4 py-3.5 font-mono">
                    <div className="text-slate-300">
                      Avail: {offer.availableCrypto} {offer.cryptoSymbol}
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      Limit: {formatMWK(offer.minLimitMWK).replace('.00', '')} - {formatMWK(offer.maxLimitMWK).replace('.00', '')}
                    </div>
                  </td>

                  {/* Payment Methods */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {offer.paymentMethods.map((pm) => (
                        <span
                          key={pm}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 border border-slate-700 text-slate-300"
                        >
                          {pm === 'AIRTEL_MONEY' ? 'Airtel Money' : pm === 'TNM_MPAMBA' ? 'TNM Mpamba' : 'Malawi Bank'}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3.5 text-right">
                    {offer.isMine ? (
                      <button onClick={() => guard(async () => { await api.closeOffer(offer.id); onChanged(); })} className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer">Your offer · Close</button>
                    ) : (
                    <button
                      onClick={() => handleStartTrade(offer)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm ${
                        activeTab === 'BUY'
                          ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                          : 'bg-rose-500 hover:bg-rose-400 text-white'
                      }`}
                    >
                      {activeTab === 'BUY' ? `Buy ${offer.cryptoSymbol}` : `Sell ${offer.cryptoSymbol}`}
                    </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Trade Initiation Modal */}
      {selectedOfferForTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {activeTab === 'BUY' ? 'Buy' : 'Sell'} {selectedOfferForTrade.cryptoSymbol} with {selectedOfferForTrade.userName}
              </h3>
              <button 
                onClick={() => setSelectedOfferForTrade(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Unit Price:</span>
                  <span className="font-mono text-white font-bold">{formatMWK(selectedOfferForTrade.priceMWK)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Trade Limits:</span>
                  <span className="font-mono text-slate-300">
                    {formatMWK(selectedOfferForTrade.minLimitMWK)} - {formatMWK(selectedOfferForTrade.maxLimitMWK)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  How much MWK do you want to {activeTab === 'BUY' ? 'pay' : 'receive'}?
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-mono text-emerald-400 font-bold">MWK</span>
                  <input
                    type="number"
                    value={tradeAmountMWK}
                    onChange={(e) => setTradeAmountMWK(e.target.value)}
                    className="w-full pl-14 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="mt-1 text-slate-400 font-mono">
                  You will {activeTab === 'BUY' ? 'receive' : 'give'}:{' '}
                  <span className="text-emerald-400 font-bold">
                    {selectedOfferForTrade ? +(parseFloat(tradeAmountMWK || '0') / selectedOfferForTrade.priceMWK).toFixed(4) : 0}{' '}
                    {selectedOfferForTrade.cryptoSymbol}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="block text-slate-300 font-medium">Payment method
                  <select value={tradeMethod} onChange={(e) => setTradeMethod(e.target.value as TelcoProvider)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs">
                    {selectedOfferForTrade.paymentMethods.map((m) => <option key={m} value={m}>{m === 'AIRTEL_MONEY' ? 'Airtel Money' : m === 'TNM_MPAMBA' ? 'TNM Mpamba' : 'Malawi Bank'}</option>)}
                  </select></label>
                {selectedOfferForTrade.type === 'BUY' && (
                  <label className="block text-slate-300 font-medium">Where should the buyer pay you?
                    <input value={sellerDetails} onChange={(e) => setSellerDetails(e.target.value)} placeholder={`Airtel Money ${user.phoneNumber}`} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs" /></label>
                )}
              </div>

              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-slate-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  NyasaVault Smart Escrow protects this trade. The seller's crypto is locked in escrow before you pay, and only the seller can release it after receiving your money.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOfferForTrade(null)}
                  className="w-1/2 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                {error && <p className="text-rose-400 text-[11px] self-center">{error}</p>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmOrder}
                  className="w-1/2 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
                >
                  Open Escrow Trade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE TRADE ROOM MODAL */}
      {activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-6">
            {/* Header */}
            <div className="p-4 px-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>NyasaVault Escrow Trade #{activeOrder.id.slice(-6).toUpperCase()}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">
                      ESCROW LOCKED
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeOrder.role === 'BUYER' ? 'Buying from' : 'Selling to'} <span className="text-slate-200 font-semibold">{activeOrder.counterpartyName}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => { setActiveOrder(null); setError(null); onChanged(); }}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Trade Room Body */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
              {/* Left Column: Escrow & Payment Details */}
              <div className="p-6 space-y-5">
                <div className="space-y-1">
                  <span className="text-xs text-slate-400">Trade Amount:</span>
                  <div className="font-mono text-2xl font-bold text-white tabular-nums">
                    {formatMWK(activeOrder.totalMWK)}
                  </div>
                  <div className="font-mono text-xs text-emerald-400">
                    {activeOrder.cryptoAmount} {activeOrder.cryptoSymbol} @ {formatMWK(activeOrder.priceMWK)}
                  </div>
                </div>

                {/* Seller Payment Info */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Seller Payment Instructions:</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeOrder.sellerPaymentAccount);
                        setCopiedAccount(true);
                        setTimeout(() => setCopiedAccount(false), 2000);
                      }}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedAccount ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="font-mono text-white text-xs bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    {activeOrder.sellerPaymentAccount}
                  </p>
                </div>

                {/* Status & Action */}
                {error && <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300">{error}</div>}
                {activeOrder.status === 'PENDING_PAYMENT' ? (
                  activeOrder.role === 'BUYER' ? (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs text-amber-300 font-mono">Pay within {countdown(activeOrder)}</div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Transaction reference from your payment SMS:</label>
                      <input type="text" placeholder="e.g. AM99420 or MP38210" value={paymentRefInput} onChange={(e) => setPaymentRefInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500" />
                    </div>
                    <button onClick={handleMarkAsPaid} disabled={busy || paymentRefInput.trim().length < 4}
                      className="w-full py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg cursor-pointer">I have paid the seller</button>
                    <button onClick={handleCancel} disabled={busy} className="w-full py-2 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer">Cancel order</button>
                  </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-300">Waiting for the buyer to pay ({countdown(activeOrder)} left). Your crypto is safely locked in escrow.</div>
                  )
                ) : activeOrder.status === 'PAYMENT_SENT' ? (
                  <div className="space-y-3 pt-2">
                    <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-300">
                      Buyer reported payment, ref <span className="font-mono font-bold">{activeOrder.paymentProofReference}</span>.
                    </div>
                    {activeOrder.role === 'SELLER' ? (
                      <>
                        <p className="text-xs text-slate-300">Check that the money is in your account. <b>Only release after you see it.</b></p>
                        <input type="password" inputMode="numeric" maxLength={4} placeholder="Your transaction PIN" value={releasePin} onChange={(e) => setReleasePin(e.target.value.replace(/\D/g, ''))}
                          className="w-full text-center tracking-widest font-mono text-sm py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-emerald-500" />
                        <button onClick={handleReleaseEscrow} disabled={busy || releasePin.length < 4} className="w-full py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg cursor-pointer">Release crypto to buyer</button>
                      </>
                    ) : <p className="text-xs text-slate-300">Waiting for the seller to confirm your payment and release the crypto.</p>}
                    <button onClick={handleDispute} disabled={busy} className="w-full py-2 text-xs text-rose-300 bg-rose-950/30 border border-rose-900 rounded-lg cursor-pointer">Something is wrong: open a dispute</button>
                  </div>
                ) : activeOrder.status === 'DISPUTED' ? (
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900 text-xs text-rose-200">Dispute open. The crypto stays locked in escrow while NyasaVault support reviews the evidence.</div>
                ) : activeOrder.status === 'CANCELLED' ? (
                  <div className="p-3 rounded-lg bg-slate-800 text-xs text-slate-300">This order was cancelled. Escrow was returned to the seller.</div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <div className="font-bold text-white text-sm">Trade complete</div>
                    <div className="text-xs text-slate-300 font-mono">{activeOrder.role === 'BUYER' ? `+${activeOrder.cryptoAmount} ${activeOrder.cryptoSymbol} added to your balance.` : `${activeOrder.cryptoAmount} ${activeOrder.cryptoSymbol} released to the buyer.`}</div>
                  </div>
                )}
              </div>

              {/* Right Column: In-Trade Live Chat */}
              <div className="p-6 flex flex-col justify-between h-[380px] bg-slate-950/40">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-xs font-semibold text-slate-300">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>Escrow Chat Room</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1 text-xs">
                  {activeOrder.chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-lg max-w-[85%] ${
                        msg.sender === 'SYSTEM'
                          ? 'bg-slate-900 border border-slate-800 text-slate-400 mx-auto text-center text-[11px]'
                          : msg.sender === 'YOU'
                          ? 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-100 ml-auto'
                          : 'bg-slate-800 text-slate-200 mr-auto'
                      }`}
                    >
                      <div className="text-[9px] uppercase tracking-wider font-semibold opacity-60 mb-0.5">
                        {msg.sender === 'SYSTEM' ? '🛡️ NyasaVault Escrow' : msg.sender === 'YOU' ? 'You' : activeOrder.counterpartyName}
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type message to counterparty..."
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POST NEW OFFER MODAL */}
      {postOfferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Create Malawi P2P Offer</h3>
              <button onClick={() => setPostOfferOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOfferSubmit} className="space-y-4 text-xs">
              {error && <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300">{error}</div>}
              <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setOfferType('SELL')}
                  className={`py-1.5 rounded font-bold cursor-pointer ${
                    offerType === 'SELL' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  I want to Sell USDT
                </button>
                <button
                  type="button"
                  onClick={() => setOfferType('BUY')}
                  className={`py-1.5 rounded font-bold cursor-pointer ${
                    offerType === 'BUY' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  I want to Buy USDT
                </button>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Your Price per USDT (MWK)</label>
                <input
                  type="number"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Min Limit (MWK)</label>
                  <input
                    type="number"
                    value={offerMinLimit}
                    onChange={(e) => setOfferMinLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Max Limit (MWK)</label>
                  <input
                    type="number"
                    value={offerMaxLimit}
                    onChange={(e) => setOfferMaxLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Payment Instructions</label>
                <textarea
                  rows={2}
                  value={offerPaymentDetails}
                  onChange={(e) => setOfferPaymentDetails(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPostOfferOpen(false)}
                  className="w-1/2 py-2.5 text-slate-300 bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg cursor-pointer"
                >
                  Publish Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
