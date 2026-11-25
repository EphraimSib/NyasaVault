import { randomInt } from 'node:crypto';
import { config } from '../config.ts';
import { HttpError } from '../errors.ts';

export interface IssuedCard { pan: string; cvv: string; expMonth: string; expYear: string; issuerRef: string }
const luhn = (d: string) => { let s = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } s += n; } return (10 - (s % 10)) % 10; };
export const newCvv = () => String(randomInt(100, 1000));

/**
 * Real card issuing needs a licensed issuer / BIN sponsor (a Malawian bank or an issuing-as-a-service partner).
 * Plug their API in `live`. Sandbox cards use a 4000 00 test prefix and can never be used at a real merchant.
 */
export function issueCard(): IssuedCard {
  if (config.providerMode !== 'sandbox') throw new HttpError(503, 'CARD_ISSUER_NOT_CONFIGURED', 'Card issuing is not enabled on this deployment');
  const body = '400000' + String(randomInt(0, 1e9)).padStart(9, '0');
  const y = new Date().getFullYear() + 4;
  return { pan: body + luhn(body).toString(), cvv: newCvv(), expMonth: String(randomInt(1, 13)).padStart(2, '0'), expYear: String(y).slice(2), issuerRef: `sbx_${Date.now()}` };
}
export const cardIssuingAvailable = () => config.providerMode === 'sandbox';
