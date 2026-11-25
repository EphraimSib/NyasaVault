import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, phone TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL, preferred_name TEXT NOT NULL, telco TEXT NOT NULL,
  password_hash TEXT NOT NULL, pin_hash TEXT NOT NULL,
  pin_fail_count INTEGER NOT NULL DEFAULT 0, pin_locked_until INTEGER NOT NULL DEFAULT 0,
  login_fail_count INTEGER NOT NULL DEFAULT 0, login_locked_until INTEGER NOT NULL DEFAULT 0,
  totp_secret_enc TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
  kyc_tier INTEGER NOT NULL DEFAULT 1, kyc_status TEXT NOT NULL DEFAULT 'NONE',
  kyc_reject_reason TEXT, kyc_verified_at INTEGER,
  id_type TEXT, nationality TEXT, occupation TEXT, source_of_funds TEXT, is_pep INTEGER NOT NULL DEFAULT 0, kyc_consent_at INTEGER,
  national_id TEXT, tax_number TEXT, district TEXT, address TEXT, dob TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  ip TEXT, user_agent TEXT, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS balances (
  account TEXT NOT NULL, asset TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account, asset)
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, txn_id TEXT NOT NULL, account TEXT NOT NULL,
  asset TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_txn ON ledger_entries(txn_id);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL,
  amount_mwk INTEGER NOT NULL DEFAULT 0, fee_mwk INTEGER NOT NULL DEFAULT 0, direction TEXT NOT NULL,
  reference TEXT NOT NULL, counterparty TEXT, equivalent_usd REAL, meta TEXT,
  idempotency_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS provider_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, external_id TEXT NOT NULL,
  payload TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (provider, external_id)
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
  pan_enc TEXT NOT NULL, cvv_enc TEXT NOT NULL, bin TEXT NOT NULL, last4 TEXT NOT NULL,
  holder TEXT NOT NULL, exp_month TEXT NOT NULL, exp_year TEXT NOT NULL, brand TEXT NOT NULL,
  status TEXT NOT NULL, monthly_limit INTEGER NOT NULL, allow_intl INTEGER NOT NULL DEFAULT 1,
  allow_gambling INTEGER NOT NULL DEFAULT 0, burner INTEGER NOT NULL DEFAULT 0,
  issuer_ref TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS card_auths (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, merchant TEXT NOT NULL, mcc TEXT, country TEXT,
  amount_mwk INTEGER NOT NULL, usd REAL, status TEXT NOT NULL, decline_reason TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deposit_addresses (
  user_id TEXT NOT NULL, asset TEXT NOT NULL, network TEXT NOT NULL, address TEXT NOT NULL, sandbox INTEGER NOT NULL,
  PRIMARY KEY (user_id, asset)
);
CREATE TABLE IF NOT EXISTS p2p_offers (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, asset TEXT NOT NULL,
  price_mwk INTEGER NOT NULL, remaining_units INTEGER NOT NULL, min_mwk INTEGER NOT NULL, max_mwk INTEGER NOT NULL,
  payment_methods TEXT NOT NULL, payment_details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS p2p_orders (
  id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES p2p_offers(id),
  buyer_id TEXT NOT NULL REFERENCES users(id), seller_id TEXT NOT NULL REFERENCES users(id),
  asset TEXT NOT NULL, units INTEGER NOT NULL, price_mwk INTEGER NOT NULL, total_mwk INTEGER NOT NULL,
  method TEXT NOT NULL, status TEXT NOT NULL, payment_ref TEXT, seller_payment_details TEXT NOT NULL,
  dispute_reason TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS p2p_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, sender_id TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, activity TEXT NOT NULL,
  ip TEXT, user_agent TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seclog_user ON security_logs(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS kyc_documents (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT, created_at INTEGER NOT NULL
);
`);

export type Row = Record<string, any>;
export const q = {
  get: (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined,
  all: (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[],
  run: (sql: string, ...p: any[]) => db.prepare(sql).run(...p),
};

/** Run fn atomically. fn MUST be synchronous (no awaits) so requests cannot interleave. */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export const now = () => Date.now();
