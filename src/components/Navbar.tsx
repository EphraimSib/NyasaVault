import React from 'react';
import { 
  ShieldCheck, 
  CreditCard, 
  ArrowLeftRight, 
  Coins, 
  Wallet, 
  Lock, 
  Plus, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { UserKycProfile } from '../types';
import { Avatar } from './Avatar';
import { formatMWK } from '../utils/formatters';

interface NavbarProps {
  activeTab: 'overview' | 'card' | 'mobile_money' | 'crypto' | 'p2p' | 'security';
  setActiveTab: (tab: 'overview' | 'card' | 'mobile_money' | 'crypto' | 'p2p' | 'security') => void;
  user: UserKycProfile;
  totalBalanceMWK: number;
  onOpenDeposit: () => void;
  onOpenKyc: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  user,
  totalBalanceMWK,
  onOpenDeposit,
  onOpenKyc,
  onLogout,
}) => {
  const verified = user.verificationStatus === 'VERIFIED';
  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => setActiveTab('overview')}
              className="flex items-center gap-2.5 text-left focus:outline-none group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-lg shadow-emerald-950/50 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap block">
                  NyasaVault
                </span>
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold block -mt-0.5">
                  Malawi Cloud Banking
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              onClick={() => setActiveTab('overview')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'overview' ? 'text-emerald-400 border-emerald-400 font-semibold' : 'border-transparent text-slate-400'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('card')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'card' ? 'text-emerald-400 border-emerald-400 font-semibold' : 'border-transparent text-slate-400'
              }`}
            >
              Virtual Card
            </button>
            <button
              onClick={() => setActiveTab('mobile_money')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'mobile_money' ? 'text-emerald-400 border-emerald-400 font-semibold' : 'border-transparent text-slate-400'
              }`}
            >
              Mobile Money (Airtel/TNM)
            </button>
            <button
              onClick={() => setActiveTab('p2p')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'p2p' ? 'text-emerald-400 border-emerald-400 font-semibold' : 'border-transparent text-slate-400'
              }`}
            >
              P2P Exchange
            </button>
            <button
              onClick={() => setActiveTab('crypto')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'crypto' ? 'text-emerald-400 border-emerald-400 font-semibold' : 'border-transparent text-slate-400'
              }`}
            >
              Buy Crypto
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'security' ? 'text-emerald-400 border-emerald-400 font-semibold' : 'border-transparent text-slate-400'
              }`}
            >
              Security & RBM KYC
            </button>
          </nav>

          {/* Zone 3: Primary Action & Profile */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenDeposit}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 rounded-lg transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Deposit MWK</span>
            </button>

            {/* KYC Profile pill-free trigger */}
            <button
              onClick={onOpenKyc}
              className="flex items-center gap-2 p-1 pl-2 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors text-left"
              title="View Malawi National ID (NRB) Verification Profile"
            >
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-slate-200 truncate max-w-[110px]">
                  {user.preferredName}
                </div>
                <div className={`text-[10px] flex items-center justify-end gap-1 ${verified ? 'text-emerald-400' : 'text-amber-400'}`}>
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>{verified ? `ID Verified · Tier ${user.kycTier}` : user.verificationStatus === 'PENDING' ? 'KYC under review' : 'Verify identity'}</span>
                </div>
              </div>
              <Avatar name={user.fullName} className="w-8 h-8 text-xs" />
            </button>
            <button onClick={onLogout} className="px-2.5 py-2 text-xs text-slate-400 hover:text-white border border-slate-800 rounded-lg cursor-pointer" title="Sign out">Sign out</button>
          </div>
        </div>
      </div>

      {/* Mobile navigation bar */}
      <div className="lg:hidden border-t border-slate-800 bg-slate-950 px-2 py-1.5 flex items-center justify-between overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${
            activeTab === 'overview' ? 'text-emerald-400 bg-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('card')}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${
            activeTab === 'card' ? 'text-emerald-400 bg-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          Card
        </button>
        <button
          onClick={() => setActiveTab('mobile_money')}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${
            activeTab === 'mobile_money' ? 'text-emerald-400 bg-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          Mobile Money
        </button>
        <button
          onClick={() => setActiveTab('p2p')}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${
            activeTab === 'p2p' ? 'text-emerald-400 bg-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          P2P
        </button>
        <button
          onClick={() => setActiveTab('crypto')}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${
            activeTab === 'crypto' ? 'text-emerald-400 bg-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          Crypto
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${
            activeTab === 'security' ? 'text-emerald-400 bg-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          KYC / Security
        </button>
      </div>
    </header>
  );
};
