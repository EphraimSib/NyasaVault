import { q, now } from './db.ts';
import { HttpError } from './errors.ts';

export interface Entry { account: string; asset: string; amount: number }

export const userAcct = (id: string) => `u:${id}`;
export const escrowAcct = (orderId: string) => `e:${orderId}`;
export const SYS = {
  float: (ch: string) => `s:float:${ch}`, // negative = net funds received through that channel
  fees: 's:fees',
  withdrawHold: 's:hold:withdrawals',
  desk: 's:desk', // crypto desk counterparty (inventory)
  cardSettle: 's:card:settlement',
};
const mustStayPositive = (a: string) => a.startsWith('u:') || a.startsWith('e:');

/** Double-entry posting. Must run inside tx(). Entries per asset must sum to 0; user/escrow balances can never go negative. */
export function post(txnId: string, entries: Entry[]): void {
  const sums = new Map<string, number>();
  for (const e of entries) {
    if (!Number.isInteger(e.amount)) throw new Error('ledger amounts must be integers');
    sums.set(e.asset, (sums.get(e.asset) ?? 0) + e.amount);
  }
  for (const [asset, s] of sums) if (s !== 0) throw new Error(`unbalanced posting for ${asset}: ${s}`);
  const t = now();
  for (const e of entries) {
    if (e.amount === 0) continue;
    q.run('INSERT OR IGNORE INTO balances (account, asset, balance) VALUES (?,?,0)', e.account, e.asset);
    q.run('UPDATE balances SET balance = balance + ? WHERE account = ? AND asset = ?', e.amount, e.account, e.asset);
    q.run('INSERT INTO ledger_entries (txn_id, account, asset, amount, created_at) VALUES (?,?,?,?,?)', txnId, e.account, e.asset, e.amount, t);
    if (mustStayPositive(e.account)) {
      const b = q.get('SELECT balance FROM balances WHERE account=? AND asset=?', e.account, e.asset)!.balance as number;
      if (b < 0) throw new HttpError(409, 'INSUFFICIENT_FUNDS', `Insufficient ${e.asset} balance`);
    }
  }
}

export function balanceOf(account: string, asset: string): number {
  return (q.get('SELECT balance FROM balances WHERE account=? AND asset=?', account, asset)?.balance as number) ?? 0;
}

/** Integrity check: cached balances must equal ledger sums and every txn must balance. */
export function verifyLedger(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const r of q.all('SELECT txn_id, asset, SUM(amount) s FROM ledger_entries GROUP BY txn_id, asset HAVING s != 0'))
    problems.push(`txn ${r.txn_id} unbalanced in ${r.asset} by ${r.s}`);
  for (const r of q.all(`SELECT b.account, b.asset, b.balance, COALESCE(SUM(l.amount),0) s FROM balances b
      LEFT JOIN ledger_entries l ON l.account=b.account AND l.asset=b.asset GROUP BY b.account, b.asset HAVING b.balance != s`))
    problems.push(`balance drift on ${r.account}/${r.asset}: cached ${r.balance} vs ledger ${r.s}`);
  return { ok: problems.length === 0, problems };
}
