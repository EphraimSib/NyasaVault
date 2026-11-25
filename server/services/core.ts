import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { q, tx, now, type Row } from '../db.ts';
import { bad, conflict, forbidden, HttpError, unauthorized } from '../errors.ts';
import { str } from '../money.ts';
import { decrypt, encrypt, hashSecret, newTotpSecret, randomToken, sha256, verifySecret, verifyTotp } from '../security.ts';
import { SESSION_COOKIE, setSessionCookie, type Ctx } from '../http.ts';
import { cardIssuingAvailable, issueCard } from '../providers/cardIssuer.ts';
import { sendEmail } from '../providers/notifier.ts';

export const id = (p: string) => `${p}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

// ---------- logging ----------
export function secLog(userId: string, activity: string, status: 'SUCCESS' | 'FLAGGED' | 'BLOCKED', c?: { ip?: string; ua?: string }) {
  q.run('INSERT INTO security_logs (user_id, activity, ip, user_agent, status, created_at) VALUES (?,?,?,?,?,?)', userId, activity, c?.ip ?? null, c?.ua ?? null, status, now());
}
export function audit(actor: string, action: string, target?: string, detail?: unknown) {
  q.run('INSERT INTO audit_log (actor, action, target, detail, created_at) VALUES (?,?,?,?,?)', actor, action, target ?? null, detail ? JSON.stringify(detail) : null, now());
}

// ---------- validation ----------
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const normPhone = (p: string) => p.replace(/[\s-]/g, '');
export const validPhone = (p: string) => /^\+265\d{9}$/.test(p);
const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '2580']);
function checkPin(pin: unknown): string {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw bad('PIN must be exactly 4 digits');
  if (WEAK_PINS.has(pin)) throw bad('That PIN is too easy to guess. Choose another.');
  return pin;
}
function checkPassword(pw: unknown): string {
  if (typeof pw !== 'string' || pw.length < 10 || pw.length > 128) throw bad('Password must be 10-128 characters');
  if (/^\d+$/.test(pw) || /^(.)\1+$/.test(pw)) throw bad('Password is too weak');
  return pw;
}

// ---------- sessions ----------
export function startSession(c: Ctx, userId: string) {
  const token = randomToken(32); const t = now();
  q.run('INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?,?)',
    sha256(token), userId, t, t, t + config.sessionTtlHours * 3600_000, c.ip, c.ua);
  setSessionCookie(c.res, token, config.sessionTtlHours * 3600);
}
export function clearSessionCookie(res: ServerResponse) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

// ---------- registration / login ----------
export async function register(c: Ctx) {
  const b = c.body;
  const fullName = str(b.fullName, 'Full name', 3, 100);
  const email = str(b.email, 'Email', 5, 254).toLowerCase();
  if (!EMAIL.test(email)) throw bad('Enter a valid email address');
  const phone = normPhone(str(b.phone, 'Phone', 8, 20));
  if (!validPhone(phone)) throw bad('Phone must be a Malawi number like +265991234567');
  if (b.telco !== 'AIRTEL' && b.telco !== 'TNM') throw bad('Choose Airtel or TNM');
  const password = checkPassword(b.password); const pin = checkPin(b.pin);
  if (q.get('SELECT 1 x FROM users WHERE email=? OR phone=?', email, phone)) throw conflict('An account with that email or phone already exists', 'ACCOUNT_EXISTS');
  const [passwordHash, pinHash] = await Promise.all([hashSecret(password), hashSecret(pin)]);
  const userId = id('usr'); const preferred = fullName.split(/\s+/)[0];
  tx(() => {
    q.run('INSERT INTO users (id,email,phone,full_name,preferred_name,telco,password_hash,pin_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      userId, email, phone, fullName, preferred, b.telco, passwordHash, pinHash, now());
    secLog(userId, 'Account created', 'SUCCESS', c);
  });
  startSession(c, userId);
  return { userId };
}

const DUMMY_HASH = 's1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
export async function login(c: Ctx) {
  const email = String(c.body.email ?? '').trim().toLowerCase(); const password = String(c.body.password ?? '');
  const u = q.get('SELECT * FROM users WHERE email=?', email);
  if (u && u.login_locked_until > now()) throw new HttpError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  const ok = await verifySecret(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) {
    if (u) {
      const n = u.login_fail_count + 1;
      q.run('UPDATE users SET login_fail_count=?, login_locked_until=? WHERE id=?', n >= 5 ? 0 : n, n >= 5 ? now() + 15 * 60_000 : 0, u.id);
      secLog(u.id, 'Failed sign-in attempt', n >= 5 ? 'BLOCKED' : 'FLAGGED', c);
    }
    throw unauthorized('Incorrect email or password');
  }
  if (u.status !== 'ACTIVE') throw forbidden('This account is suspended. Contact support.', 'SUSPENDED');
  if (u.totp_enabled) {
    const code = String(c.body.totp ?? '');
    if (!code) throw new HttpError(401, 'TOTP_REQUIRED', 'Enter the 6-digit code from your authenticator app');
    if (!verifyTotp(decrypt(u.totp_secret_enc, config.encKey), code)) { secLog(u.id, 'Failed 2FA code', 'FLAGGED', c); throw unauthorized('Invalid authentication code'); }
  }
  q.run('UPDATE users SET login_fail_count=0, login_locked_until=0 WHERE id=?', u.id);
  startSession(c, u.id); secLog(u.id, 'Signed in', 'SUCCESS', c);
  return { userId: u.id };
}
export function logout(c: Ctx) {
  q.run('UPDATE sessions SET revoked_at=? WHERE id_hash=?', now(), c.sessionHash); clearSessionCookie(c.res);
}

/** Verify the transaction PIN with lockout. Call before any money-moving or sensitive action. */
export async function verifyPin(u: Row, pin: unknown, c?: { ip?: string; ua?: string }): Promise<void> {
  const fresh = q.get('SELECT * FROM users WHERE id=?', u.id)!;
  if (fresh.pin_locked_until > now()) throw new HttpError(429, 'PIN_LOCKED', 'PIN locked after too many attempts. Try again later.');
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin) || !(await verifySecret(pin, fresh.pin_hash))) {
    const n = fresh.pin_fail_count + 1; const lock = n >= 5;
    q.run('UPDATE users SET pin_fail_count=?, pin_locked_until=? WHERE id=?', lock ? 0 : n, lock ? now() + 15 * 60_000 : 0, u.id);
    secLog(u.id, lock ? 'PIN locked after repeated failures' : 'Incorrect PIN entered', lock ? 'BLOCKED' : 'FLAGGED', c);
    throw new HttpError(403, 'PIN_INVALID', lock ? 'Too many attempts. PIN locked for 15 minutes.' : `Incorrect PIN. ${5 - n} attempt(s) left.`);
  }
  if (fresh.pin_fail_count) q.run('UPDATE users SET pin_fail_count=0 WHERE id=?', u.id);
}

export async function changePin(c: Ctx) {
  await verifyPin(c.user!, c.body.currentPin, c);
  const np = checkPin(c.body.newPin);
  q.run('UPDATE users SET pin_hash=? WHERE id=?', await hashSecret(np), c.user!.id);
  secLog(c.user!.id, 'Transaction PIN changed', 'SUCCESS', c);
}
export async function changePassword(c: Ctx) {
  if (!(await verifySecret(String(c.body.currentPassword ?? ''), c.user!.password_hash))) throw forbidden('Current password is incorrect', 'PASSWORD_INVALID');
  const pw = checkPassword(c.body.newPassword);
  q.run('UPDATE users SET password_hash=? WHERE id=?', await hashSecret(pw), c.user!.id);
  q.run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND id_hash != ? AND revoked_at IS NULL', now(), c.user!.id, c.sessionHash);
  secLog(c.user!.id, 'Password changed; other sessions signed out', 'SUCCESS', c);
}

// ---------- 2FA ----------
export function totpSetup(c: Ctx) {
  const u = c.user!; if (u.totp_enabled) throw conflict('Two-factor authentication is already on');
  const secret = newTotpSecret();
  q.run('UPDATE users SET totp_secret_enc=? WHERE id=?', encrypt(secret, config.encKey), u.id);
  return { secret, otpauthUrl: `otpauth://totp/NyasaVault:${encodeURIComponent(u.email)}?secret=${secret}&issuer=NyasaVault` };
}
export function totpEnable(c: Ctx) {
  const u = c.user!; if (!u.totp_secret_enc) throw bad('Start setup first');
  if (!verifyTotp(decrypt(u.totp_secret_enc, config.encKey), String(c.body.code ?? ''))) throw bad('Invalid code', 'TOTP_INVALID');
  q.run('UPDATE users SET totp_enabled=1 WHERE id=?', u.id); secLog(u.id, 'Two-factor authentication enabled', 'SUCCESS', c);
}
export async function totpDisable(c: Ctx) {
  const u = c.user!; await verifyPin(u, c.body.pin, c);
  if (!u.totp_enabled || !verifyTotp(decrypt(u.totp_secret_enc, config.encKey), String(c.body.code ?? ''))) throw bad('Invalid code', 'TOTP_INVALID');
  q.run('UPDATE users SET totp_enabled=0, totp_secret_enc=NULL WHERE id=?', u.id); secLog(u.id, 'Two-factor authentication disabled', 'FLAGGED', c);
}

// ---------- sessions list ----------
export function listSessions(c: Ctx) {
  return q.all('SELECT id_hash, created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY last_seen_at DESC', c.user!.id, now())
    .map((s) => ({ id: s.id_hash.slice(0, 16), createdAt: s.created_at, lastSeenAt: s.last_seen_at, ip: s.ip, device: s.user_agent, current: s.id_hash === c.sessionHash }));
}
export function revokeSession(c: Ctx) {
  const rows = q.all('SELECT id_hash FROM sessions WHERE user_id=? AND revoked_at IS NULL', c.user!.id).filter((s) => s.id_hash.startsWith(c.params.id));
  if (rows.length !== 1) throw bad('Session not found');
  q.run('UPDATE sessions SET revoked_at=? WHERE id_hash=?', now(), rows[0].id_hash); secLog(c.user!.id, 'Session revoked', 'SUCCESS', c);
}
export function revokeOthers(c: Ctx) {
  q.run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND id_hash != ? AND revoked_at IS NULL', now(), c.user!.id, c.sessionHash);
}

// ---------- KYC ----------
const MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
function saveDoc(userId: string, kind: string, dataUrl: unknown): string {
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m || !MIME[m[1]]) throw bad(`${kind}: upload a JPG, PNG, WEBP or PDF`);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 1000 || buf.length > 3_000_000) throw bad(`${kind}: file must be under 3 MB`);
  const docId = id('doc'); const dir = path.join(config.dataDir, 'kyc', userId); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${docId}.${MIME[m[1]]}`); fs.writeFileSync(file, buf, { mode: 0o600 });
  q.run('INSERT INTO kyc_documents (id,user_id,kind,path,mime,created_at) VALUES (?,?,?,?,?,?)', docId, userId, kind, file, m[1], now());
  return docId;
}
export const ID_TYPES = ['NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENCE'] as const;
const SOURCES = ['SALARY', 'BUSINESS', 'FARMING', 'REMITTANCES', 'SAVINGS', 'OTHER'];
/** Malawian-citizen KYC (Financial Crimes Act 2017 / RBM): ID document + selfie, occupation, source of funds, PEP declaration, data-processing consent. */
export function submitKyc(c: Ctx) {
  const u = c.user!; const b = c.body;
  if (u.kyc_status === 'PENDING') throw conflict('Your verification is already under review');
  if (u.kyc_status === 'VERIFIED') throw conflict('You are already verified');
  if (b.nationality !== 'MALAWIAN') throw forbidden('NyasaVault is currently available to Malawian citizens only', 'MALAWIANS_ONLY');
  if (!ID_TYPES.includes(b.idType)) throw bad('Choose National ID, Passport or Driving Licence');
  const idNumber = str(b.idNumber, 'ID number', 5, 20).toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9-]+$/.test(idNumber)) throw bad('ID number may only contain letters, numbers and dashes');
  if (q.get("SELECT 1 x FROM users WHERE national_id=? AND id_type=? AND id != ? AND kyc_status IN ('PENDING','VERIFIED')", idNumber, b.idType, u.id)) throw conflict('That ID is already registered to another account', 'ID_IN_USE');
  if (b.consent !== true) throw bad('You must consent to identity verification and data processing (Data Protection Act)', 'CONSENT_REQUIRED');
  if (typeof b.isPep !== 'boolean') throw bad('Answer the politically exposed person question');
  if (!SOURCES.includes(b.sourceOfFunds)) throw bad('Choose your main source of funds');
  const occupation = str(b.occupation, 'Occupation', 2, 80);
  const dob = str(b.dateOfBirth, 'Date of birth', 8, 12);
  const age = (Date.now() - new Date(dob).getTime()) / 31_557_600_000;
  if (!Number.isFinite(age) || age < 18 || age > 120) throw bad('You must be 18 or older');
  const district = str(b.district, 'District', 2, 60); const address = str(b.address, 'Residential address', 5, 200);
  const tax = b.taxNumber ? str(b.taxNumber, 'MRA TPIN', 4, 30) : null;
  const docs = b.documents ?? {};
  tx(() => {
    saveDoc(u.id, 'ID_FRONT', docs.idFront);
    if (b.idType !== 'PASSPORT') saveDoc(u.id, 'ID_BACK', docs.idBack);
    saveDoc(u.id, 'SELFIE', docs.selfie);
    q.run(`UPDATE users SET id_type=?, national_id=?, nationality='MALAWIAN', dob=?, district=?, address=?, tax_number=?, occupation=?, source_of_funds=?, is_pep=?, kyc_consent_at=?, kyc_status='PENDING', kyc_reject_reason=NULL WHERE id=?`,
      b.idType, idNumber, dob, district, address, tax, occupation, b.sourceOfFunds, b.isPep ? 1 : 0, now(), u.id);
    secLog(u.id, `KYC submitted (${b.idType})`, 'SUCCESS', c);
    if (b.isPep) audit('system', 'kyc.pep_declared', u.id, { note: 'Enhanced due diligence required before approval' });
  });
}
/** The virtual card is issued ONLY after KYC approval, in the verified legal name. */
export function issueCardFor(userId: string, fullName: string) {
  if (q.get('SELECT 1 x FROM cards WHERE user_id=?', userId) || !cardIssuingAvailable()) return;
  const card = issueCard();
  q.run(`INSERT INTO cards (id,user_id,pan_enc,cvv_enc,bin,last4,holder,exp_month,exp_year,brand,status,monthly_limit,issuer_ref,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id('card'), userId, encrypt(card.pan, config.encKey), encrypt(card.cvv, config.encKey), card.pan.slice(0, 4), card.pan.slice(-4), fullName.toUpperCase().slice(0, 26),
    card.expMonth, card.expYear, 'VISA', 'ACTIVE', 4_000_000 * 100, card.issuerRef, now());
  secLog(userId, 'Virtual card issued', 'SUCCESS');
}

/** Admin decision. tier 2 = ID verified, tier 3 = + address/tax verified. */
export function decideKyc(userId: string, decision: 'VERIFIED' | 'REJECTED', tier: number, reason?: string) {
  const u = q.get('SELECT * FROM users WHERE id=?', userId); if (!u) throw bad('User not found');
  if (u.kyc_status !== 'PENDING') throw conflict('No pending KYC for this user');
  if (decision === 'VERIFIED' && u.is_pep && !reason) throw bad('PEP: record the enhanced due diligence note in reason before approving');
  tx(() => {
    if (decision === 'VERIFIED') {
      if (tier !== 2 && tier !== 3) throw bad('tier must be 2 or 3');
      q.run(`UPDATE users SET kyc_status='VERIFIED', kyc_tier=?, kyc_verified_at=?, kyc_reject_reason=NULL WHERE id=?`, tier, now(), userId);
      issueCardFor(userId, u.full_name);
      secLog(userId, `KYC approved (Tier ${tier})`, 'SUCCESS');
    } else {
      q.run(`UPDATE users SET kyc_status='REJECTED', kyc_reject_reason=? WHERE id=?`, str(reason, 'reason', 3, 300), userId);
      secLog(userId, 'KYC rejected', 'FLAGGED');
    }
    audit('admin', `kyc.${decision.toLowerCase()}`, userId, { tier, reason });
  });
}

// ---------- tiers & limits ----------
export function requireTier(u: Row, n: number, feature: string) {
  if (u.kyc_tier < n) throw forbidden(`${feature} requires identity verification (KYC Tier ${n})`, 'KYC_REQUIRED');
}
const TYPES_COUNTED = `('DEPOSIT','WITHDRAWAL','CARD_PAYMENT','CRYPTO_BUY','CRYPTO_SELL')`;
export function checkLimits(u: Row, amountTambala: number) {
  const lim = config.tierLimits[u.kyc_tier]; const t = now();
  const sum = (since: number) => (q.get(`SELECT COALESCE(SUM(amount_mwk),0) s FROM transactions WHERE user_id=? AND type IN ${TYPES_COUNTED} AND status IN ('COMPLETED','PENDING','PROCESSING') AND created_at>?`, u.id, since)!.s as number);
  if (sum(t - 86400_000) + amountTambala > lim.daily * 100) throw forbidden(`This would exceed your daily limit of MWK ${lim.daily.toLocaleString('en-US')} (Tier ${u.kyc_tier}). Complete KYC to raise it.`, 'DAILY_LIMIT');
  if (sum(t - 30 * 86400_000) + amountTambala > lim.monthly * 100) throw forbidden(`This would exceed your monthly limit of MWK ${lim.monthly.toLocaleString('en-US')} (Tier ${u.kyc_tier}).`, 'MONTHLY_LIMIT');
}

// ---------- password reset ----------
function makeResetToken(userId: string): string {
  const token = randomToken(32);
  q.run('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)', sha256(token), userId, now() + 30 * 60_000, now());
  return `${config.appUrl.replace(/\/$/, '')}/?reset=${token}`;
}
/** Always answers the same way so it cannot be used to discover which emails have accounts. */
export async function forgotPassword(c: Ctx) {
  const email = String(c.body.email ?? '').trim().toLowerCase();
  const u = q.get('SELECT * FROM users WHERE email=? AND status=\'ACTIVE\'', email);
  if (u && (q.get('SELECT COUNT(*) n FROM password_resets WHERE user_id=? AND created_at>?', u.id, now() - 3600_000)!.n as number) < 3) {
    const link = makeResetToken(u.id);
    await sendEmail(u.email, 'Reset your NyasaVault password', `Open this link within 30 minutes to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this email.`);
    secLog(u.id, 'Password reset requested', 'FLAGGED', c);
  }
  return { message: 'If that email has an account, a reset link has been sent.' };
}
export async function resetPassword(c: Ctx) {
  const row = q.get('SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?', sha256(String(c.body.token ?? '')), now());
  if (!row) throw bad('This reset link is invalid or has expired', 'RESET_INVALID');
  const hash = await hashSecret(checkPassword(c.body.newPassword));
  tx(() => {
    q.run('UPDATE password_resets SET used_at=? WHERE token_hash=?', now(), row.token_hash);
    q.run('UPDATE users SET password_hash=?, login_fail_count=0, login_locked_until=0 WHERE id=?', hash, row.user_id);
    q.run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now(), row.user_id);
    secLog(row.user_id, 'Password reset; all sessions signed out', 'FLAGGED', c);
  });
}
/** Support-assisted reset (after you verify the customer's identity out of band). */
export function adminResetLink(email: string) {
  const u = q.get('SELECT id FROM users WHERE email=?', email.trim().toLowerCase()); if (!u) throw bad('No such user');
  audit('admin', 'password.reset_link', u.id);
  return { link: makeResetToken(u.id), expiresInMinutes: 30 };
}
