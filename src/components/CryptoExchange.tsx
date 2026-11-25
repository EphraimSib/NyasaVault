import React, { useState } from 'react';
import { 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownLeft, 
  QrCode, 
  Copy, 
  Check, 
  CheckCircle2, 
  Wallet,
  ShieldCheck,
  RefreshCw,
  X
} from 'lucide-react';
import { CryptoAsset, UserKycProfile } from '../types';
import { formatMWK, formatUSD } from '../utils/formatters';
import { api, errMsg } from '../lib/api';

interface CryptoExchangeProps {
  assets: CryptoAsset[];
  userBalanceMWK: number;
  user: UserKycProfile;
  sandbox: boolean;
  spreadBps: number;
  onChanged: () => void;
  onOpenKyc: () => void;
}

export const CryptoExchange: React.FC<CryptoExchangeProps> = ({
  assets,
  userBalanceMWK,
  user,
  sandbox,
  spreadBps,
  onChanged,
  onOpenKyc,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>(assets[0]?.symbol);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedAsset = (assets.find((a) => a.symbol === selectedSymbol) ?? assets[0]) as CryptoAsset;
  const setSelectedAsset = (a: CryptoAsset) => setSelectedSymbol(a.symbol);
  const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL'>('BUY');
  const [spendAmountMWK, setSpendAmountMWK] = useState<string>('50000');
  const [sellAmountCrypto, setSellAmountCrypto] = useState<string>('25');
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  if (!selectedAsset) return <div className="text-sm text-slate-400 text-center py-16">Crypto prices are unavailable right now. Please try again shortly.</div>;
  const verified = user.kycTier >= 2;

  const mwkToSpend = parseFloat(spendAmountMWK) || 0;
  const cryptoToReceive = Math.floor((mwkToSpend / selectedAsset.buyPriceMWK) * 1e6) / 1e6;
  const cryptoToSell = parseFloat(sellAmountCrypto) || 0;
  const mwkToReceive = Math.floor(cryptoToSell * selectedAsset.sellPriceMWK);
  const totalPortfolioMWK = assets.reduce((acc, a) => acc + a.userBalance * a.priceMWK, 0);

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault(); setTradeError(null); setBusy(true);
    try {
      if (tradeMode === 'BUY') {
        const r = await api.buyCrypto(selectedAsset.symbol, mwkToSpend, selectedAsset.buyPriceMWK);
        setSuccessToast(`Purchased ${r.units} ${selectedAsset.symbol}`);
      } else {
        const r = await api.sellCrypto(selectedAsset.symbol, cryptoToSell, selectedAsset.sellPriceMWK);
        setSuccessToast(`Sold ${cryptoToSell} ${selectedAsset.symbol} for ${formatMWK(r.mwk)}`);
      }
      onChanged(); setTimeout(() => setSuccessToast(null), 4000);
    } catch (err) { setTradeError(errMsg(err)); onChanged(); } finally { setBusy(false); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Toast Alert */}
      {successToast && (
        <div className="p-3.5 bg-emerald-500 text-slate-950 font-semibold text-xs rounded-xl flex items-center justify-between shadow-lg shadow-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header & Portfolio Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-emerald-400" />
            <span>Direct Crypto Purchase & Spot Trading</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Buy Bitcoin, Ethereum, and Tether directly with your Malawi Kwacha balance. Real-time rates pegged to global index.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setReceiveModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            <span>Receive Crypto</span>
          </button>
          <button
            onClick={() => setSendModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-teal-400" />
            <span>Send Crypto</span>
          </button>
        </div>
      </div>

      {/* Portfolio Card Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400">Total Crypto Valuation</span>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            {formatMWK(totalPortfolioMWK)}
          </div>
          <div className="font-mono text-xs text-emerald-400">
            ~ {formatUSD(assets.reduce((acc, a) => acc + a.userBalance * a.priceUSD, 0))} USD
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400">Available MWK for Buying</span>
          <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {formatMWK(userBalanceMWK)}
          </div>
          <div className="text-xs text-slate-400">
            Funded via Airtel Money & TNM Mpamba
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400">Supported Network Standard</span>
          <div className="text-sm font-semibold text-white">
            TRC20 · ERC20 · Native SegWit · Solana
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secured Cold Storage Custody</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Assets Table on Left, Instant Trade Desk on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Asset List */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Malawi Kwacha Spot Crypto Market
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3 text-right">Price (MWK)</th>
                  <th className="px-4 py-3 text-right">24h</th>
                  <th className="px-4 py-3 text-right">Your Holdings</th>
                  <th className="px-4 py-3 text-center">Select</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {assets.map((asset) => {
                  const isSelected = selectedAsset.symbol === asset.symbol;
                  return (
                    <tr
                      key={asset.symbol}
                      onClick={() => setSelectedAsset(asset)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5 font-sans font-medium text-slate-200">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-emerald-400">
                            {asset.symbol.slice(0, 3)}
                          </div>
                          <div>
                            <div className="font-bold text-white">{asset.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{asset.symbol}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right font-bold text-white tabular-nums">
                        {formatMWK(asset.priceMWK).replace('.00', '')}
                        <div className="text-[10px] text-slate-400 font-normal">
                          {formatUSD(asset.priceUSD)}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                        <span className={`inline-flex items-center gap-0.5 ${
                          asset.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {asset.change24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {asset.change24h >= 0 ? `+${asset.change24h}%` : `${asset.change24h}%`}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <div className="font-semibold text-slate-200">
                          {asset.userBalance} {asset.symbol}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatMWK(asset.userBalance * asset.priceMWK).replace('.00', '')}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className={`w-2 h-2 rounded-full inline-block ${
                          isSelected ? 'bg-emerald-400 ring-4 ring-emerald-500/20' : 'bg-slate-700'
                        }`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Instant Buy / Sell Desk */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                {selectedAsset.symbol}
              </div>
              <h3 className="text-base font-bold text-white">
                Instant Trade: {selectedAsset.name}
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              {tradeMode === 'BUY' ? 'Buy' : 'Sell'} 1 {selectedAsset.symbol} = {formatMWK(tradeMode === 'BUY' ? selectedAsset.buyPriceMWK : selectedAsset.sellPriceMWK)}
            </span>
          </div>

          {/* Trade Mode Toggle */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setTradeMode('BUY')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                tradeMode === 'BUY'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Buy {selectedAsset.symbol}
            </button>
            <button
              type="button"
              onClick={() => setTradeMode('SELL')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                tradeMode === 'SELL'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sell {selectedAsset.symbol}
            </button>
          </div>

          {!verified && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200">Crypto trading needs a verified identity. <button type="button" onClick={onOpenKyc} className="underline font-semibold cursor-pointer">Verify now</button></div>
          )}
          <p className="text-[11px] text-slate-400">Prices include a {(spreadBps / 100).toFixed(2)}% service spread. No other fees. Crypto is volatile; you can lose money.</p>
          {sandbox && <button type="button" onClick={() => api.faucet(selectedAsset.symbol, 100).then(onChanged).catch((er) => setTradeError(errMsg(er)))} className="text-[11px] text-amber-300 underline cursor-pointer">Sandbox: add 100 test {selectedAsset.symbol}</button>}
          <form onSubmit={handleExecuteTrade} className="space-y-4">
            {tradeMode === 'BUY' ? (
              <>
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-slate-300 font-medium">Pay with MWK Balance</label>
                    <span className="text-slate-400 font-mono">Avail: {formatMWK(userBalanceMWK)}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-mono text-emerald-400 font-bold text-xs">MWK</span>
                    <input
                      type="number"
                      required
                      min="1000"
                      max={userBalanceMWK}
                      value={spendAmountMWK}
                      onChange={(e) => setSpendAmountMWK(e.target.value)}
                      className="w-full pl-14 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>You Receive Approximately:</span>
                    <span className="font-mono text-white font-bold text-sm">
                      {cryptoToReceive} {selectedAsset.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Network:</span>
                    <span className="text-slate-300 font-medium">{selectedAsset.network}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Settlement:</span>
                    <span className="text-emerald-400 font-medium">Instant Wallet Credit</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || !verified || mwkToSpend <= 0 || mwkToSpend > userBalanceMWK}
                  className="w-full py-3 text-xs font-bold uppercase tracking-wider text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  Buy {selectedAsset.symbol} Now
                </button>
              </>
            ) : (
              <>
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-slate-300 font-medium">Amount of {selectedAsset.symbol} to Sell</label>
                    <span className="text-slate-400 font-mono">Holdings: {selectedAsset.userBalance}</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      max={selectedAsset.userBalance}
                      value={sellAmountCrypto}
                      onChange={(e) => setSellAmountCrypto(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-rose-500 text-sm"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>You Receive in Cloud Banking:</span>
                    <span className="font-mono text-emerald-400 font-bold text-sm">
                      {formatMWK(mwkToReceive)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Destination:</span>
                    <span className="text-slate-300">MWK Cloud Account & Virtual Card</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || !verified || cryptoToSell <= 0 || cryptoToSell > selectedAsset.userBalance}
                  className="w-full py-3 text-xs font-bold uppercase tracking-wider text-white bg-rose-500 hover:bg-rose-400 disabled:opacity-50 rounded-lg shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
                >
                  Sell {selectedAsset.symbol} for MWK
                </button>
              </>
            )}
          {tradeError && <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300">{tradeError}</div>}
          </form>
        </div>
      </div>

      {/* RECEIVE CRYPTO MODAL (QR Code & Address) */}
      {receiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl text-center">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Deposit {selectedAsset.symbol}</h3>
              <button onClick={() => setReceiveModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated QR Code Canvas */}
            <div className="w-48 h-48 mx-auto bg-white p-3 rounded-2xl flex items-center justify-center shadow-lg">
              <div className="w-full h-full border-4 border-slate-900 rounded-lg p-2 flex flex-col justify-between">
                <div className="flex justify-between">
                  <div className="w-8 h-8 bg-slate-950" />
                  <div className="w-8 h-8 bg-slate-950" />
                </div>
                <div className="text-center font-black text-xs text-slate-900">
                  {selectedAsset.symbol}
                </div>
                <div className="flex justify-between items-end">
                  <div className="w-8 h-8 bg-slate-950" />
                  <div className="w-4 h-4 bg-emerald-600 rounded-full" />
                </div>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <span className="text-slate-400">Network: {selectedAsset.network}</span>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-200 break-all select-all flex items-center justify-between gap-2">
                <span>{selectedAsset.depositAddress ?? 'On-chain deposits are not enabled yet'}</span>
                <button
                  onClick={() => selectedAsset.depositAddress && handleCopy(selectedAsset.depositAddress)}
                  className="text-emerald-400 hover:text-emerald-300 p-1 shrink-0"
                >
                  {copiedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              {sandbox ? 'SANDBOX placeholder address: do not send real funds.' : `Send only ${selectedAsset.symbol} via ${selectedAsset.network} to this address.`}
            </p>
          </div>
        </div>
      )}

      {sendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Send {selectedAsset.symbol}</h3>
              <button onClick={() => setSendModalOpen(false)} aria-label="Close" className="text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-300">On-chain withdrawals are not enabled yet. They need a licensed custody partner and travel-rule checks. Meanwhile you can sell for MWK or trade peer-to-peer.</p>
            <button onClick={() => setSendModalOpen(false)} className="w-full py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 rounded-lg cursor-pointer">OK</button>
          </div>
        </div>
      )}
    </div>
  );
};
