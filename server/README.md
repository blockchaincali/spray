# Spray naira backend

Guests load a **bundle by bank transfer** (one exact-amount VFD virtual account per top-up), then **tap to spray** ₦200–₦5,000 at a time. The big screen and stream overlay update live. When the host ends the party, unspent bundles go to the celebrant and the total, minus Spray's fee, is paid to the celebrant's bank account.

The VFD integration in `src/vfd/` is copied from ShopSwiftApp (`artifacts/api-server/src/integrations/vfd`). Keep both copies in step.

## Money rules
- A bundle is credited only when **VFD's own status query** confirms the exact amount on that deposit's virtual account. Webhooks are optional hints and are re-verified by session id.
- Each deposit credits once; taps can never take a bundle below zero, even with rapid taps.
- Payouts are sent once per party; if the outcome is unknown, Spray asks VFD before ever resending.

## Run locally

```bash
# 1. Database (once)
createdb spray            # or: sudo -u postgres createdb -O <user> spray

# 2. Config
cd server
cp .env.example .env      # then copy the VFD sandbox values from ShopSwiftApp's api-server .env
npm install
npm run dev               # Spray API on :4100

# 3. Web app (in another terminal, repo root)
VITE_SPRAY_API_URL=http://localhost:4100 npm run dev   # http://localhost:5173/#/n/new
```

No VFD keys yet? Set `SPRAY_FAKE_BANK=true` in `.env` for a pretend bank.

### Sandbox test run
1. Open `http://localhost:5173/#/n/new`, create a party with a sandbox payout account, open the **Big screen**.
2. Open the **Guest link** (phone or another tab), enter a name, pick a bundle.
3. Tap **Simulate the transfer (sandbox)**: VFD's credit simulator pays the virtual account and the bundle loads.
4. Tap to spray, watch the big screen. Then **End party & pay out** on the host dashboard.

## Deploy to the ShopSwift VPS (spray.shopswiftpay.com)
- Separate Postgres database and user for Spray; `server/.env` with `NODE_ENV=staging` while on sandbox keys.
- `pm2 start "npm start" --name spray-api --cwd /path/to/spray/server`
- Nginx: `spray.shopswiftpay.com` serves the built web app (`npm run build` with `VITE_SPRAY_API_URL=https://spray.shopswiftpay.com`, files in `dist/`) and proxies `/api/` to `localhost:4100` with `proxy_buffering off;` (needed for the live event stream).
- Add `https://spray.shopswiftpay.com` to `SPRAY_ALLOWED_ORIGINS`.

## Before real money
VFD live keys and compliance; a licensed collection/settlement setup for holding bundle balances until payout; refunds policy; KYC limits. Get legal advice.

## Tests
`npm test` (needs a Postgres test database: `TEST_DATABASE_URL`, default `postgres://spray:spray@localhost:5432/spray_test`).
