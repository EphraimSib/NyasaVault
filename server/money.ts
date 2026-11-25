import { bad } from './errors.ts';
/** MWK is stored as integer tambala (1/100 kwacha); crypto as integer 1e-8 units. */
export const toTambala = (mwk: number) => Math.round(mwk * 100);
export const fromTambala = (t: number) => t / 100;
export const UNIT = 1e8;
export const toUnits = (n: number) => Math.round(n * UNIT);
export const fromUnits = (u: number) => u / UNIT;

export function positiveMwk(v: unknown, field = 'amountMWK', max = 1_000_000_000): number {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) throw bad(`${field} must be a positive number`);
  if (n > max) throw bad(`${field} is too large`);
  const t = toTambala(n);
  if (t <= 0) throw bad(`${field} is too small`);
  return t;
}
export function str(v: unknown, field: string, min = 1, max = 200): string {
  if (typeof v !== 'string') throw bad(`${field} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`${field} must be ${min}-${max} characters`);
  return s;
}
