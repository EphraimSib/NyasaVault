import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, Clock, AlertCircle, Loader2, Upload, CreditCard } from 'lucide-react';
import { AppConfig, UserKycProfile } from '../types';
import { formatMWK } from '../utils/formatters';
import { api, errMsg } from '../lib/api';
import { Avatar } from './Avatar';

interface Props { isOpen: boolean; onClose: () => void; user: UserKycProfile; config: AppConfig; onSubmitted: () => void }

const ID_TYPES = [
  { v: 'NATIONAL_ID', label: 'National ID (NRB)', back: true },
  { v: 'PASSPORT', label: 'Malawian Passport', back: false },
  { v: 'DRIVING_LICENCE', label: 'Driving Licence', back: true },
] as const;
const SOURCES = [['SALARY', 'Salary / wages'], ['BUSINESS', 'Business income'], ['FARMING', 'Farming / agriculture'], ['REMITTANCES', 'Remittances'], ['SAVINGS', 'Savings'], ['OTHER', 'Other']];
const MALAWI_DISTRICTS = ['Balaka', 'Blantyre', 'Chikwawa', 'Chiradzulu', 'Chitipa', 'Dedza', 'Dowa', 'Karonga', 'Kasungu', 'Likoma', 'Lilongwe', 'Machinga', 'Mangochi', 'Mchinji', 'Mulanje', 'Mwanza', 'Mzimba', 'Neno', 'Nkhata Bay', 'Nkhotakota', 'Nsanje', 'Ntcheu', 'Ntchisi', 'Phalombe', 'Rumphi', 'Salima', 'Thyolo', 'Zomba'];

const toDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read file')); r.readAsDataURL(f); });
const field = 'w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500';
const lbl = 'block text-[11px] font-medium text-slate-300 mb-1';

export const KycVerificationModal: React.FC<Props> = ({ isOpen, onClose, user, config, onSubmitted }) => {
  const [f, setF] = useState({ idType: 'NATIONAL_ID', idNumber: '', dateOfBirth: '', district: 'Lilongwe', address: '', occupation: '', sourceOfFunds: 'SALARY', taxNumber: '', isPep: '' as '' | 'yes' | 'no', consent: false });
  const [docs, setDocs] = useState<{ idFront?: string; idBack?: string; selfie?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;

  const idCfg = ID_TYPES.find((t) => t.v === f.idType)!;
  const pickFile = (k: 'idFront' | 'idBack' | 'selfie') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 2_200_000) { setError('Each file must be under 2 MB. Take a smaller photo.'); return; }
    setError(null); setDocs((d) => ({ ...d, [k]: undefined })); setDocs((d) => ({ ...d }));
    try { const url = await toDataUrl(file); setDocs((d) => ({ ...d, [k]: url })); } catch (er) { setError(errMsg(er)); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!docs.idFront || !docs.selfie || (idCfg.back && !docs.idBack)) return setError('Please upload all required photos');
    if (!f.isPep) return setError('Please answer the politically exposed person question');
    setBusy(true);
    try {
      await api.submitKyc({ ...f, nationality: 'MALAWIAN', isPep: f.isPep === 'yes', taxNumber: f.taxNumber || undefined, documents: docs });
      onSubmitted(); onClose();
    } catch (er) { setError(errMsg(er)); } finally { setBusy(false); }
  };

  const status = user.verificationStatus;
  const tiers = [1, 2, 3].map((t) => ({ t, ...config.tierLimits[t] }));
  const tierNames = ['Phone & email', 'Verified ID', 'ID + MRA TPIN & address proof'];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400"><ShieldCheck className="w-4 h-4" /></div>
            <div><h3 className="text-base font-bold text-white">Identity Verification (KYC)</h3><p className="text-xs text-slate-400">Malawian citizens · Financial Crimes Act 2017 · RBM guidelines</p></div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Limits by tier */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {tiers.map(({ t, daily }) => (
              <div key={t} className={`p-3 rounded-xl border space-y-1 ${user.kycTier === t ? 'bg-emerald-950/30 border-emerald-500/60' : 'bg-slate-950 border-slate-800 opacity-70'}`}>
                <div className="font-bold text-slate-200 flex items-center justify-between">Tier {t}{user.kycTier === t && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}</div>
                <div className="text-[10px] text-slate-400">{tierNames[t - 1]}</div>
                <div className="font-mono text-[11px] text-slate-200">{formatMWK(daily).replace('.00', '')}/day</div>
              </div>
            ))}
          </div>

          {status === 'VERIFIED' && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 border border-emerald-500/40 space-y-3">
              <div className="flex items-center gap-3"><Avatar name={user.fullName} className="w-12 h-12" />
                <div><div className="font-bold text-white">{user.fullName}</div><div className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verified · Tier {user.kycTier}</div></div></div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-[10px] uppercase text-slate-400">{ID_TYPES.find((t) => t.v === user.idType)?.label ?? 'ID'}</dt><dd className="font-mono text-slate-100">{user.nationalIdNumber}</dd></div>
                <div><dt className="text-[10px] uppercase text-slate-400">Nationality</dt><dd className="text-slate-100">Malawian</dd></div>
                <div><dt className="text-[10px] uppercase text-slate-400">District</dt><dd className="text-slate-100">{user.district}</dd></div>
                <div><dt className="text-[10px] uppercase text-slate-400">Verified on</dt><dd className="text-slate-100">{user.verifiedAt ? new Date(user.verifiedAt).toLocaleDateString('en-GB') : ''}</dd></div>
              </dl>
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5 pt-2 border-t border-slate-800"><CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Your virtual card was issued in your verified legal name.</div>
            </div>
          )}

          {status === 'PENDING' && (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-sm text-amber-200 flex gap-3"><Clock className="w-5 h-5 shrink-0 mt-0.5" />
              <div><b>Under review.</b> Our compliance team is checking your documents. Your virtual card is issued automatically as soon as you are approved.</div></div>
          )}

          {(status === 'UNVERIFIED' || status === 'REJECTED') && (
            <form onSubmit={submit} className="space-y-4">
              {status === 'REJECTED' && <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300">Your last submission was not approved{user.kycRejectReason ? `: ${user.kycRejectReason}` : ''}. Please correct and resubmit.</div>}
              <p className="text-xs text-slate-300">Verify with a <b>Malawian National ID, Passport or Driving Licence</b> to unlock your virtual card, crypto and P2P trading.</p>

              <div className="grid grid-cols-3 gap-2">
                {ID_TYPES.map((t) => (
                  <button type="button" key={t.v} onClick={() => setF({ ...f, idType: t.v })} className={`p-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${f.idType === t.v ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>{t.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>{idCfg.label} number</label><input className={`${field} font-mono uppercase`} required value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value })} /></div>
                <div><label className={lbl}>Date of birth</label><input className={field} type="date" required max={new Date(Date.now() - 18 * 31_557_600_000).toISOString().slice(0, 10)} value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} /></div>
                <div><label className={lbl}>District</label><select className={field} value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })}>{MALAWI_DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></div>
                <div><label className={lbl}>Occupation</label><input className={field} required value={f.occupation} onChange={(e) => setF({ ...f, occupation: e.target.value })} /></div>
              </div>
              <div><label className={lbl}>Residential address</label><input className={field} required value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Area / village, plot, town" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Main source of funds</label><select className={field} value={f.sourceOfFunds} onChange={(e) => setF({ ...f, sourceOfFunds: e.target.value })}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className={lbl}>MRA TPIN <span className="text-slate-500">(optional, for Tier 3)</span></label><input className={`${field} font-mono`} value={f.taxNumber} onChange={(e) => setF({ ...f, taxNumber: e.target.value })} /></div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-300">Photos (JPG/PNG/PDF, under 2 MB each)</div>
                {([['idFront', `${idCfg.label}: front / photo page`, true], ['idBack', `${idCfg.label}: back`, idCfg.back], ['selfie', 'Selfie holding your ID', true]] as const).filter(([, , need]) => need).map(([k, text]) => (
                  <label key={k} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer ${docs[k] ? 'border-emerald-600 bg-emerald-950/20 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
                    {docs[k] ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}<span className="flex-1">{text}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture={k === 'selfie' ? 'user' : undefined} className="hidden" onChange={pickFile(k)} />
                  </label>
                ))}
              </div>

              <fieldset className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300">
                <legend className="px-1 text-[11px] font-semibold">Politically exposed person (PEP)?</legend>
                <p className="text-[11px] text-slate-400">Do you, or a close family member or associate, hold or recently hold a prominent public position in Malawi or abroad?</p>
                <div className="flex gap-4">{(['no', 'yes'] as const).map((v) => <label key={v} className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pep" checked={f.isPep === v} onChange={() => setF({ ...f, isPep: v })} />{v === 'yes' ? 'Yes' : 'No'}</label>)}</div>
              </fieldset>
              <label className="flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer"><input type="checkbox" className="mt-0.5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} required />
                <span>I am a Malawian citizen and confirm the information is true. I consent to NyasaVault verifying my identity and processing my personal data under the Data Protection Act, and to reporting suspicious activity to the Financial Intelligence Authority where required by law.</span></label>

              {error && <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
              <button type="submit" disabled={busy || !f.consent} className="w-full py-3 text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 cursor-pointer">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Submit for verification</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
