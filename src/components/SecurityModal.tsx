import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Lock, Smartphone, Ban, Laptop, KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { SecurityLog, SessionInfo, UserKycProfile, VirtualCardDetails } from '../types';
import { api, errMsg } from '../lib/api';

interface Props {
  logs: SecurityLog[]; user: UserKycProfile; card: VirtualCardDetails | null;
  onUpdateCard: (updated: Partial<VirtualCardDetails>) => Promise<void>;
  onOpenKyc: () => void; onChanged: () => void;
}
const box = 'p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3';
const inp = 'w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500';
const btn = 'px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50';
const Msg: React.FC<{ ok?: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <div className={`p-2.5 rounded-lg text-xs flex items-start gap-1.5 border ${ok ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-rose-950/40 border-rose-800 text-rose-300'}`}>
    {ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}<span>{children}</span></div>
);

export const SecurityModal: React.FC<Props> = ({ logs, user, card, onUpdateCard, onOpenKyc, onChanged }) => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [panel, setPanel] = useState<null | 'pin' | 'password' | '2fa-on' | '2fa-off'>(null);
  const [f, setF] = useState({ cur: '', next: '', confirm: '', code: '' });
  const [totp, setTotp] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSessions = useCallback(() => { api.sessions().then(setSessions).catch(() => {}); }, []);
  useEffect(loadSessions, [loadSessions]);

  const open = (p: typeof panel) => { setPanel(p); setMsg(null); setF({ cur: '', next: '', confirm: '', code: '' }); setTotp(null); if (p === '2fa-on') api.totpSetup().then(setTotp).catch((e) => setMsg({ ok: false, text: errMsg(e) })); };
  const act = async (fn: () => Promise<unknown>, done: string, close = true) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); onChanged(); loadSessions(); if (close) setTimeout(() => setPanel(null), 1500); }
    catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(false); }
  };
  const digits = (k: 'cur' | 'next' | 'confirm' | 'code', n: number) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '').slice(0, n) });

  const frozen = card?.status === 'FROZEN';
  const verified = user.verificationStatus === 'VERIFIED';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5"><ShieldCheck className="w-6 h-6 text-emerald-400" /><span>Security & Identity</span></h1>
          <p className="text-sm text-slate-400 mt-1">Protect your account, PIN, devices and card.</p>
        </div>
        {card && (
          <button onClick={() => onUpdateCard({ status: frozen ? 'ACTIVE' : 'FROZEN' }).catch((e) => setMsg({ ok: false, text: errMsg(e) }))}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer ${frozen ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-rose-600 hover:bg-rose-500 text-white'}`}>
            <Ban className="w-4 h-4" /><span>{frozen ? 'Unfreeze card' : 'Emergency: freeze card'}</span>
          </button>
        )}
      </div>
      {msg && !panel && <Msg ok={msg.ok}>{msg.text}</Msg>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className={box}><div className="text-xs text-slate-400 flex justify-between">Transaction PIN <Lock className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-lg font-bold text-white">4-digit PIN</div><p className="text-xs text-slate-400">Required for withdrawals and releasing P2P escrow. Locks for 15 minutes after 5 wrong attempts.</p>
          <button onClick={() => open('pin')} className="text-xs text-emerald-400 font-medium cursor-pointer">Change PIN →</button></div>
        <div className={box}><div className="text-xs text-slate-400 flex justify-between">Password <KeyRound className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-lg font-bold text-white">Sign-in password</div><p className="text-xs text-slate-400">Changing it signs out all your other devices.</p>
          <button onClick={() => open('password')} className="text-xs text-emerald-400 font-medium cursor-pointer">Change password →</button></div>
        <div className={box}><div className="text-xs text-slate-400 flex justify-between">Identity (KYC) <ShieldCheck className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-lg font-bold text-white">{verified ? `Verified · Tier ${user.kycTier}` : user.verificationStatus === 'PENDING' ? 'Under review' : 'Not verified'}</div>
          <p className="text-xs text-slate-400">{verified ? 'Your ID is verified and your virtual card is active.' : 'Verify to unlock your virtual card, crypto and P2P.'}</p>
          <button onClick={onOpenKyc} className="text-xs text-emerald-400 font-medium cursor-pointer">{verified ? 'View profile' : 'Verify now'} →</button></div>
      </div>

      <div className={box}>
        <div className="flex items-center justify-between gap-4">
          <div><div className="text-sm font-semibold text-white flex items-center gap-2"><Smartphone className="w-4 h-4 text-emerald-400" />Two-factor authentication (authenticator app)</div>
            <p className="text-xs text-slate-400 mt-0.5">{user.totpEnabled ? 'On. A 6-digit code is required every time you sign in.' : 'Add a second step at sign-in using Google Authenticator, Authy or similar.'}</p></div>
          <button onClick={() => open(user.totpEnabled ? '2fa-off' : '2fa-on')} className={`${btn} ${user.totpEnabled ? 'bg-slate-800 text-slate-200' : 'bg-emerald-400 text-slate-950'}`}>{user.totpEnabled ? 'Turn off' : 'Turn on'}</button>
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <form className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4" onSubmit={(e) => {
            e.preventDefault();
            if (panel === 'pin') { if (f.next !== f.confirm) return setMsg({ ok: false, text: 'New PINs do not match' }); act(() => api.changePin(f.cur, f.next), 'PIN updated'); }
            if (panel === 'password') { if (f.next !== f.confirm) return setMsg({ ok: false, text: 'Passwords do not match' }); act(() => api.changePassword(f.cur, f.next), 'Password updated'); }
            if (panel === '2fa-on') act(() => api.totpEnable(f.code), 'Two-factor authentication is on');
            if (panel === '2fa-off') act(() => api.totpDisable(f.cur, f.code), 'Two-factor authentication is off');
          }}>
            <h3 className="text-base font-bold text-white">{{ pin: 'Change transaction PIN', password: 'Change password', '2fa-on': 'Turn on two-factor', '2fa-off': 'Turn off two-factor' }[panel]}</h3>
            {panel === 'pin' && <>
              <input className={`${inp} text-center tracking-[0.5em] font-mono`} type="password" inputMode="numeric" placeholder="Current PIN" value={f.cur} onChange={digits('cur', 4)} required autoFocus />
              <input className={`${inp} text-center tracking-[0.5em] font-mono`} type="password" inputMode="numeric" placeholder="New PIN" value={f.next} onChange={digits('next', 4)} required />
              <input className={`${inp} text-center tracking-[0.5em] font-mono`} type="password" inputMode="numeric" placeholder="Confirm new PIN" value={f.confirm} onChange={digits('confirm', 4)} required /></>}
            {panel === 'password' && <>
              <input className={inp} type="password" placeholder="Current password" value={f.cur} onChange={(e) => setF({ ...f, cur: e.target.value })} required autoFocus />
              <input className={inp} type="password" placeholder="New password (min. 10 characters)" minLength={10} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />
              <input className={inp} type="password" placeholder="Confirm new password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></>}
            {panel === '2fa-on' && (totp ? <>
              <p className="text-xs text-slate-300">In your authenticator app choose &quot;Enter a setup key&quot; and type this key (account: NyasaVault):</p>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono text-sm text-emerald-300 break-all select-all">{totp.secret}</div>
              <input className={`${inp} text-center tracking-[0.4em] font-mono`} inputMode="numeric" placeholder="6-digit code" value={f.code} onChange={digits('code', 6)} required /></> : <Loader2 className="w-5 h-5 animate-spin text-emerald-400 mx-auto" />)}
            {panel === '2fa-off' && <>
              <input className={`${inp} text-center tracking-[0.5em] font-mono`} type="password" inputMode="numeric" placeholder="Transaction PIN" value={f.cur} onChange={digits('cur', 4)} required autoFocus />
              <input className={`${inp} text-center tracking-[0.4em] font-mono`} inputMode="numeric" placeholder="6-digit code" value={f.code} onChange={digits('code', 6)} required /></>}
            {msg && <Msg ok={msg.ok}>{msg.text}</Msg>}
            <div className="flex gap-2"><button type="button" onClick={() => setPanel(null)} className={`${btn} w-1/2 bg-slate-800 text-slate-300`}>Cancel</button>
              <button type="submit" disabled={busy} className={`${btn} w-1/2 bg-emerald-400 text-slate-950`}>{busy ? 'Saving…' : 'Confirm'}</button></div>
          </form>
        </div>
      )}

      <div className={box}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-white">Signed-in devices</h2>
          {sessions.length > 1 && <button onClick={() => api.revokeOtherSessions().then(loadSessions)} className="text-xs text-rose-400 cursor-pointer">Sign out all other devices</button>}</div>
        <ul className="divide-y divide-slate-800 text-xs">
          {sessions.map((s) => (
            <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
              <div><div className="text-slate-200">{(s.device || 'Unknown device').slice(0, 70)} {s.current && <span className="ml-1 text-[10px] text-emerald-400">this device</span>}</div>
                <div className="text-slate-500 font-mono">{s.ip} · active {new Date(s.lastSeenAt).toLocaleString('en-GB')}</div></div>
              {!s.current && <button onClick={() => api.revokeSession(s.id).then(loadSessions)} className="text-rose-400 cursor-pointer">Revoke</button>}
            </li>))}
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Laptop className="w-5 h-5 text-emerald-400" /><span>Account activity</span></h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800"><tr>
              <th className="px-4 py-3">When</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">Device</th><th className="px-4 py-3 text-right">Result</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">{l.timestamp}</td>
                  <td className="px-4 py-3 font-sans font-medium text-slate-200">{l.activity}</td>
                  <td className="px-4 py-3 text-slate-400">{l.ipAddress}</td>
                  <td className="px-4 py-3 text-slate-400">{l.device}</td>
                  <td className="px-4 py-3 text-right"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${l.status === 'SUCCESS' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/60' : l.status === 'BLOCKED' ? 'text-rose-400 border-rose-800 bg-rose-950/60' : 'text-amber-400 border-amber-800 bg-amber-950/60'}`}>{l.status}</span></td>
                </tr>))}
              {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 font-sans">No activity yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
