import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { api, ApiError, errMsg } from '../lib/api';
import type { AppConfig } from '../types';

const input = 'w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500';
const label = 'block text-xs font-medium text-slate-300 mb-1';

export const AuthScreen: React.FC<{ onAuthed: () => void }> = ({ onAuthed }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(() => (new URLSearchParams(window.location.search).get('reset') ? 'reset' : 'login'));
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needTotp, setNeedTotp] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [f, setF] = useState({ fullName: '', email: '', phone: '+265', telco: 'AIRTEL' as 'AIRTEL' | 'TNM', password: '', pin: '', pin2: '', totp: '', agree: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  useEffect(() => { api.config().then(setCfg).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (mode === 'register') {
      if (f.pin !== f.pin2) return setError('PINs do not match');
      if (!f.agree) return setError('Please accept the terms to continue');
    }
    setBusy(true); setInfo(null);
    try {
      if (mode === 'forgot') { const r = await api.forgot(f.email); setInfo(r.message); return; }
      if (mode === 'reset') {
        await api.reset(new URLSearchParams(window.location.search).get('reset') ?? '', f.password);
        window.history.replaceState({}, '', '/'); setInfo('Password changed. Sign in with your new password.'); setMode('login'); setF((p) => ({ ...p, password: '' })); return;
      }
      if (mode === 'register') await api.register({ fullName: f.fullName, email: f.email, phone: f.phone.replace(/\s/g, ''), telco: f.telco, password: f.password, pin: f.pin });
      else await api.login({ email: f.email, password: f.password, totp: needTotp ? f.totp : undefined });
      onAuthed();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOTP_REQUIRED') { setNeedTotp(true); setError(null); }
      else setError(errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center mx-auto">NV</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">NyasaVault</h1>
          <p className="text-sm text-slate-400">Cloud banking for Malawi: mobile money, virtual card, crypto and P2P</p>
        </div>

        {cfg?.sandbox && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            <b>Sandbox environment.</b> No real money moves. Mobile money, cards and crypto addresses are simulated.
          </div>
        )}

        <form onSubmit={submit} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          {(mode === 'login' || mode === 'register') ? (
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); setNeedTotp(false); }}
                className={`py-2 text-xs font-semibold rounded-lg cursor-pointer ${mode === m ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'}`}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
          ) : <h2 className="text-base font-bold text-white">{mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2>}

          {mode === 'register' && (
            <>
              <div><label className={label}>Full name (as on your National ID)</label><input className={input} required value={f.fullName} onChange={set('fullName')} autoComplete="name" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><label className={label}>Mobile number</label><input className={input} required value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="+265991234567" /></div>
                <div><label className={label}>Network</label><select className={input} value={f.telco} onChange={set('telco')}><option value="AIRTEL">Airtel</option><option value="TNM">TNM</option></select></div>
              </div>
            </>
          )}
          {mode !== 'reset' && <div><label className={label}>Email</label><input className={input} type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></div>}
          {mode !== 'forgot' && <div><label className={label}>{mode === 'reset' ? 'New password' : 'Password'} {mode === 'register' && <span className="text-slate-500">(min. 10 characters)</span>}</label>
            <input className={input} type="password" required minLength={mode === 'login' ? 1 : 10} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>}

          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className={label}>Transaction PIN (4 digits)</label><input className={`${input} text-center tracking-[0.4em] font-mono`} type="password" inputMode="numeric" maxLength={4} required value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></div>
              <div><label className={label}>Confirm PIN</label><input className={`${input} text-center tracking-[0.4em] font-mono`} type="password" inputMode="numeric" maxLength={4} required value={f.pin2} onChange={(e) => setF({ ...f, pin2: e.target.value.replace(/\D/g, '') })} /></div>
            </div>
          )}
          {mode === 'login' && needTotp && (
            <div><label className={label}>Authenticator code</label><input className={`${input} text-center tracking-[0.4em] font-mono`} inputMode="numeric" maxLength={6} autoFocus required value={f.totp} onChange={(e) => setF({ ...f, totp: e.target.value.replace(/\D/g, '') })} /></div>
          )}
          {mode === 'register' && (
            <label className="flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer">
              <input type="checkbox" checked={f.agree} onChange={set('agree')} className="mt-0.5" />
              <span>I confirm my details are accurate and agree to NyasaVault&apos;s terms and privacy policy. I understand my account starts at KYC Tier 1 with low limits until my National ID is verified.</span>
            </label>
          )}

          {info && <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300">{info}</div>}
          {error && <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}

          <button type="submit" disabled={busy} className="w-full py-3 text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 rounded-lg flex items-center justify-center gap-2 cursor-pointer">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {{ login: 'Sign in', register: 'Create account', forgot: 'Send reset link', reset: 'Set new password' }[mode]}
          </button>
          {mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(null); setInfo(null); }} className="w-full text-xs text-slate-400 hover:text-white cursor-pointer">Forgot password?</button>}
          {(mode === 'forgot' || mode === 'reset') && <button type="button" onClick={() => { setMode('login'); setError(null); setInfo(null); }} className="w-full text-xs text-slate-400 hover:text-white cursor-pointer">Back to sign in</button>}
        </form>
        <p className="text-center text-[11px] text-slate-500">Regulated financial services require a valid licence from the Reserve Bank of Malawi.</p>
      </div>
    </div>
  );
};
