import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { VirtualCardSection } from './components/VirtualCardSection';
import { MobileMoneyModal } from './components/MobileMoneyModal';
import { P2PExchange } from './components/P2PExchange';
import { CryptoExchange } from './components/CryptoExchange';
import { SecurityModal } from './components/SecurityModal';
import { KycVerificationModal } from './components/KycVerificationModal';
import { TransactionReceiptModal } from './components/TransactionReceiptModal';
import { AuthScreen } from './components/AuthScreen';
import { api, ApiError, errMsg, setUnauthorizedHandler } from './lib/api';
import { AppState, Transaction, TelcoProvider, VirtualCardDetails } from './types';

type Tab = 'overview' | 'card' | 'mobile_money' | 'crypto' | 'p2p' | 'security';

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking session
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [mobileMoneyModalOpen, setMobileMoneyModalOpen] = useState(false);
  const [mobileMoneyInitialMode, setMobileMoneyInitialMode] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<Transaction | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s); setAuthed(true); setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setAuthed(false); setState(null); }
      else setLoadError(errMsg(e));
    }
  }, []);

  useEffect(() => { setUnauthorizedHandler(() => { setAuthed(false); setState(null); }); refresh(); }, [refresh]);
  // Keep balances/transactions fresh (pending deposits settle in the background)
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15000);
    return () => clearInterval(t);
  }, [authed, refresh]);

  const openMobileMoney = (mode: 'DEPOSIT' | 'WITHDRAW') => { setMobileMoneyInitialMode(mode); setMobileMoneyModalOpen(true); };

  const handleLogout = async () => { try { await api.logout(); } catch { /* cookie is cleared server-side anyway */ } setAuthed(false); setState(null); setActiveTab('overview'); };

  if (authed === null && !loadError) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>;
  if (loadError && !state) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
      <div className="space-y-3 max-w-sm"><AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" /><p className="text-sm text-slate-300">{loadError}</p>
        <button onClick={refresh} className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-lg cursor-pointer">Retry</button></div>
    </div>
  );
  if (!authed || !state) return <AuthScreen onAuthed={refresh} />;

  const { user, card, cryptoAssets, transactions, p2pOffers, p2pOrders, securityLogs, config } = state;
  const balanceMWK = state.balanceMWK;

  // ---- actions: every one calls the server, then re-syncs state ----
  const handleUpdateCard = async (patch: Partial<VirtualCardDetails>) => {
    if (patch.status) await api.freezeCard(patch.status === 'FROZEN');
    const { monthlySpendLimitMWK, allowInternational, allowOnlineGambling, isBurnerMode } = patch;
    const controls = Object.fromEntries(Object.entries({ monthlySpendLimitMWK, allowInternational, allowOnlineGambling, isBurnerMode }).filter(([, v]) => v !== undefined));
    if (Object.keys(controls).length) await api.cardControls(controls);
    await refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      {config.sandbox && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-[11px] text-center py-1.5 px-3">
          SANDBOX: no real money moves. Mobile money, card and crypto addresses are simulated.
        </div>
      )}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} user={user} totalBalanceMWK={balanceMWK}
        onOpenDeposit={() => openMobileMoney('DEPOSIT')} onOpenKyc={() => setKycModalOpen(true)} onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loadError && <div className="mb-4 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800 text-xs text-amber-300">Connection problem: {loadError}. Showing the last known data.</div>}
        {state.pricesError && (activeTab === 'crypto' || activeTab === 'p2p') && <div className="mb-4 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800 text-xs text-amber-300">Live crypto prices are unavailable right now ({state.pricesError}). Trading is paused.</div>}

        {activeTab === 'overview' && (
          <DashboardOverview user={user} card={card} cryptoAssets={cryptoAssets} transactions={transactions}
            onOpenDeposit={() => openMobileMoney('DEPOSIT')} onOpenWithdraw={() => openMobileMoney('WITHDRAW')}
            onNavigateToCard={() => setActiveTab('card')} onNavigateToP2P={() => setActiveTab('p2p')} onNavigateToCrypto={() => setActiveTab('crypto')}
            onSelectTransaction={(tx) => setSelectedReceiptTx(tx)} onOpenKyc={() => setKycModalOpen(true)} />
        )}

        {activeTab === 'card' && (card ? (
          <VirtualCardSection card={card} user={user} onUpdateCard={handleUpdateCard} transactions={transactions}
            onOpenDeposit={() => openMobileMoney('DEPOSIT')} onSelectTransaction={(tx) => setSelectedReceiptTx(tx)}
            onOpenKyc={() => setKycModalOpen(true)} sandbox={config.sandbox} onChanged={refresh} />
        ) : (
          <div className="max-w-md mx-auto text-center py-16 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto"><ShieldCheck className="w-8 h-8" /></div>
            <h2 className="text-xl font-bold text-white">Your virtual card is waiting</h2>
            <p className="text-sm text-slate-400">
              {user.verificationStatus === 'PENDING' ? 'Your documents are under review. Your Visa virtual card is issued automatically the moment you are approved.'
                : config.cardIssuing ? 'Verify your identity with a Malawian National ID, Passport or Driving Licence. Your card is issued in your legal name as soon as you are approved.'
                : 'Virtual cards are not enabled on this deployment yet.'}
            </p>
            {config.cardIssuing && user.verificationStatus !== 'PENDING' && <button onClick={() => setKycModalOpen(true)} className="px-5 py-2.5 text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg cursor-pointer">Verify my identity</button>}
          </div>
        ))}

        {activeTab === 'mobile_money' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Malawi Telco Integrations: Airtel Money & TNM Mpamba
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Direct USSD & STK push gateway for instant deposits and interbank withdrawals across all 28 districts of Malawi.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    openMobileMoney('DEPOSIT');
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg cursor-pointer transition-all"
                >
                  Deposit Money
                </button>
                <button
                  onClick={() => {
                    openMobileMoney('WITHDRAW');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer transition-all"
                >
                  Withdraw to Bank / Wallet
                </button>
              </div>
            </div>

            {/* Operator showcase cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Airtel Money Card */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-rose-950/20 border border-rose-900/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-sm">
                    airtel
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 bg-rose-950 px-2 py-0.5 rounded border border-rose-800">
                    DIAL *211#
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Airtel Money Malawi</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Integrated with Airtel Push API. Instant SIM toolkit prompt sent to prefixes (+265 99x, 98x, 90x).
                  </p>
                </div>
                <div className="pt-2 border-t border-rose-950 flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Approve on your phone</span>
                  <button
                    onClick={() => {
                      setMobileMoneyInitialMode('DEPOSIT');
                      setMobileMoneyModalOpen(true);
                    }}
                    className="text-rose-400 hover:text-rose-300 font-sans font-semibold cursor-pointer"
                  >
                    Deposit with Airtel →
                  </button>
                </div>
              </div>

              {/* TNM Mpamba Card */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950/20 border border-emerald-900/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                    TNM
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    DIAL *444#
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">TNM Mpamba</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Seamless integration with TNM Mpamba gateway. Instant prompt for prefixes (+265 88x, 80x, 89x).
                  </p>
                </div>
                <div className="pt-2 border-t border-emerald-950 flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Approve on your phone</span>
                  <button
                    onClick={() => {
                      setMobileMoneyInitialMode('DEPOSIT');
                      setMobileMoneyModalOpen(true);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 font-sans font-semibold cursor-pointer"
                  >
                    Deposit with Mpamba →
                  </button>
                </div>
              </div>
            </div>

            {/* Fee Transparency Schedule as requested */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <h3 className="text-base font-bold text-white">Transparent Withdrawal Fee Schedule</h3>
              <p className="text-xs text-slate-400">
                In strict adherence to Reserve Bank of Malawi guidelines, all third-party transfer fees are displayed upfront before confirmation:
              </p>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-900 uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">Withdrawal Destination</th>
                      <th className="px-4 py-2.5">Carrier / Platform Fee</th>
                      <th className="px-4 py-2.5">NatSwitch Interbank Clearing</th>
                      <th className="px-4 py-2.5">Settlement Window</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                    <tr>
                      <td className="px-4 py-3 font-sans font-medium text-white">Malawi Commercial Banks (NBM, Stb, FDH)</td>
                      <td className="px-4 py-3 text-amber-400">1.5%</td>
                      <td className="px-4 py-3 text-amber-400">MWK 750.00</td>
                      <td className="px-4 py-3 font-sans text-slate-400">Instant (NatSwitch)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans font-medium text-white">Airtel Money Mobile Wallet</td>
                      <td className="px-4 py-3 text-amber-400">1.0% (Min MWK 250)</td>
                      <td className="px-4 py-3 text-slate-400">MWK 0.00</td>
                      <td className="px-4 py-3 font-sans text-slate-400">Instant (Within 60s)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans font-medium text-white">TNM Mpamba Mobile Wallet</td>
                      <td className="px-4 py-3 text-amber-400">1.0% (Min MWK 250)</td>
                      <td className="px-4 py-3 text-slate-400">MWK 0.00</td>
                      <td className="px-4 py-3 font-sans text-slate-400">Instant (Within 60s)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans font-medium text-white">P2P Escrow Transfers</td>
                      <td className="px-4 py-3 text-emerald-400">0.0% (Zero Fee Maker)</td>
                      <td className="px-4 py-3 text-slate-400">MWK 0.00</td>
                      <td className="px-4 py-3 font-sans text-slate-400">Upon Seller Release</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'p2p' && (
          <P2PExchange offers={p2pOffers} orders={p2pOrders} user={user} sandbox={config.sandbox} ttlMinutes={config.p2pOrderTtlMinutes}
            onChanged={refresh} onOpenKyc={() => setKycModalOpen(true)} />
        )}

        {activeTab === 'crypto' && (
          <CryptoExchange assets={cryptoAssets} userBalanceMWK={balanceMWK} user={user} sandbox={config.sandbox} spreadBps={config.spreadBps}
            onChanged={refresh} onOpenKyc={() => setKycModalOpen(true)} />
        )}

        {activeTab === 'security' && (
          <SecurityModal logs={securityLogs} user={user} card={card} onUpdateCard={handleUpdateCard} onOpenKyc={() => setKycModalOpen(true)} onChanged={refresh} />
        )}
      </main>

      {/* Floating Regulatory Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">NyasaVault Cloud Banking PLC</span>
            <span aria-hidden="true">·</span>
            <span>Lilongwe, Republic of Malawi</span>
          </div>
          {config.licenceNotice && <div className="text-slate-400 text-[11px]">{config.licenceNotice}</div>}
        </div>
      </footer>

      <MobileMoneyModal
        isOpen={mobileMoneyModalOpen}
        onClose={() => { setMobileMoneyModalOpen(false); refresh(); }}
        user={user} currentBalanceMWK={balanceMWK} initialMode={mobileMoneyInitialMode}
        channels={config.channels} sandbox={config.sandbox}
      />

      <KycVerificationModal isOpen={kycModalOpen} onClose={() => setKycModalOpen(false)} user={user} config={config} onSubmitted={refresh} />

      <TransactionReceiptModal transaction={selectedReceiptTx} onClose={() => setSelectedReceiptTx(null)} />
    </div>
  );
}
