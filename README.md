# NyasaVault: Malawi Cloud Banking

Mobile money (Airtel Money / TNM Mpamba), a **KYC-gated virtual Visa card**, crypto buy/sell, and **P2P escrow**, for Malawian citizens.

## The flow
1. **Register** (email, +265 phone, password, 4-digit transaction PIN). Starts at **Tier 1** with low limits. No card yet.
2. **KYC**: Malawian **National ID, Passport or Driving Licence** + selfie, occupation, source of funds, PEP declaration and data-protection consent. Admin reviews.
3. **Approval** → Tier 2/3 limits unlock and the **virtual card is issued automatically** in the verified legal name. Full card number, expiry and CVV are visible on the card (optional "Hide numbers" privacy toggle). Regenerating the CVV needs the PIN.
4. **Deposit** via mobile money (async prompt on the customer's phone, confirmed by the provider), **withdraw** with PIN and server-calculated fees.
5. **Card controls** (freeze, monthly limit, international, gambling block, burner CVV) are enforced on every authorisation.
6. **Crypto** spot buy/sell with a disclosed spread, **P2P** with real two-party escrow (only the seller can release; auto-cancel on timeout; disputes go to support).

## Architecture
```
src/        React 19 + Tailwind UI (talks only to /api)
shared/     fee schedule + bank list used by BOTH UI and server
server/     zero-dependency Node 22 API (node:http, node:sqlite, node:crypto)
  ledger.ts       double-entry ledger; balances can never go negative; verifyLedger() audit
  providers/      adapters: mobile money, card issuer, market data  (sandbox | live)
  services/       auth/KYC, wallet, card, crypto, p2p
```
Security: scrypt password/PIN hashing, PIN lockout (5 tries → 15 min), login lockout, HttpOnly SameSite=Strict sessions, TOTP 2FA, AES-256-GCM for card data at rest, CSP + HSTS headers, rate limiting, idempotency keys, origin checks, webhook HMAC + provider re-confirmation, audit log, AML flag on large transactions.

## Run locally
```bash
npm install
npm run dev:server     # API on :3000 (sandbox mode, fake money)
npm run dev            # UI on :5173
npm test               # 10 integration tests
```
Sandbox tips: mobile numbers ending `0000` are declined (tests failure paths); the Crypto tab has a test-coin faucet; the Card tab has a merchant-payment simulator.

## Try it on Android (Termux) or any minimal Linux
The server needs **Node 22.18+ and nothing else** (no npm packages, no build): `node server/index.ts`.
```bash
pkg update && pkg install nodejs git          # Termux (Debian/Ubuntu: install Node 22+)
node -v                                       # must be v22.18 or newer
cd nyasavault && sh scripts/termux.sh         # installs, builds the UI, starts the server
```
Open `http://localhost:3000` in the phone browser (or `http://<phone-ip>:3000` from another device). Admin console: `http://localhost:3000/admin` (dev key is printed in `.env.example` notes: `dev-admin-key-dev-admin-key-dev-admin-key`; **never use it in production**).
If `npm run build:web` fails on Termux (Vite's native parts sometimes lack Android builds), build `dist/` on a PC (`npm install && npm run build:web`) and copy the `dist/` folder next to `server/`, or use `proot-distro install ubuntu`. The API and `/admin` work without `dist/`.

## Install as an app (PWA)
On HTTPS (or localhost) the browser offers "Install app" / "Add to Home screen". `public/sw.js` caches only the app shell and static files; API calls are never cached. To make an Android APK later, wrap the deployed site with Capacitor (note: session cookies are SameSite=Strict, so load the live site inside the wrapper or add token login).

## Approve KYC (admin console or curl)
Open **/admin**, paste `ADMIN_API_KEY`, review the KYC queue (documents, PEP flag), approve/reject, resolve P2P disputes, view compliance flags, check ledger integrity, and issue support-assisted password-reset links.

Curl equivalents:
```bash
curl -H "x-admin-key: $ADMIN_API_KEY" $APP_URL/api/admin/kyc                       # pending queue
curl -H "x-admin-key: $ADMIN_API_KEY" $APP_URL/api/admin/kyc/documents/<docId> -o doc.jpg
curl -X POST -H "x-admin-key: $ADMIN_API_KEY" -H 'Content-Type: application/json' \
  -d '{"decision":"VERIFIED","tier":2}' $APP_URL/api/admin/kyc/<userId>/decision    # PEPs need a "reason" (EDD note)
curl -H "x-admin-key: $ADMIN_API_KEY" $APP_URL/api/admin/p2p/disputes
curl -H "x-admin-key: $ADMIN_API_KEY" $APP_URL/api/admin/ledger/verify
```

## Deploy
```bash
cp .env.example .env   # fill secrets: openssl rand -base64 48
docker compose up -d --build
```
Put it behind HTTPS (Caddy/nginx/Cloudflare). Mount `/data` on persistent, **backed-up** storage (SQLite DB + KYC documents). Single instance (SQLite + in-memory rate limiter); move to Postgres/Redis before scaling out.
A staging site may use `PROVIDER_MODE=sandbox` with `ALLOW_SANDBOX_IN_PROD=true`; the UI then shows a SANDBOX banner.

## Before real customers (not code: licences and partners)
| Area | Status |
|---|---|
| Airtel Money collections | Adapter written from public Open API conventions. **Verify against your merchant docs and test in their sandbox.** Disbursement not implemented. |
| TNM Mpamba, bank payouts (NatSwitch) | **Not integrated**; channels auto-disable in `live` mode until you implement `server/providers/mobileMoney.ts`. |
| Virtual card | Sandbox issuer only. Needs a licensed issuer / BIN sponsor; implement `providers/cardIssuer.ts` + real-time auth webhook → `authorize()`. Never ship sandbox cards to customers. |
| Crypto custody / on-chain | Needs a custody partner; deposit addresses and sends are disabled in `live`. |
| Licensing | Operating payments, e-money or virtual-asset services in Malawi requires authorisation from the **Reserve Bank of Malawi** (Payment Systems Act 2016). Get legal advice on crypto status. |
| AML/CFT | KYC fields, PEP flag, EDD gate and large-transaction audit flag are built. You still need a compliance officer, sanctions screening, STR filing to the **Financial Intelligence Authority**, record retention, and a data-protection registration. |
| Identity checks | Documents are reviewed manually. There is no public NRB verification API integrated. |
| Tier limits / fees | Placeholders in `.env` / `shared/fees.ts`. Set per your licence and bank partner. |

No code can make an app "compliant" by itself; this implements the controls a regulator will expect to see, with the partner integrations left as clearly marked seams.
