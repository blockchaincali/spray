-- Spray naira backend. All money is in kobo (bigint). Idempotent: safe to run on every deploy.

CREATE TABLE IF NOT EXISTS parties (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  celebrant       text NOT NULL,
  planner         text,
  host_token_hash text NOT NULL,
  payout_bank_code       text NOT NULL,
  payout_account_number  text NOT NULL,
  payout_account_name    text NOT NULL,
  status          text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);

-- A guest's bundle for one party. balance_kobo is what they can still spray.
CREATE TABLE IF NOT EXISTS wallets (
  id               text PRIMARY KEY,
  party_id         text NOT NULL REFERENCES parties(id),
  guest_name       text NOT NULL,
  guest_token_hash text NOT NULL,
  balance_kobo     bigint NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),
  loaded_kobo      bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallets_party ON wallets(party_id);

-- One exact-amount VFD virtual account per bundle top-up.
CREATE TABLE IF NOT EXISTS deposits (
  id                 text PRIMARY KEY,
  wallet_id          text NOT NULL REFERENCES wallets(id),
  party_id           text NOT NULL REFERENCES parties(id),
  reference          text NOT NULL UNIQUE,
  account_number     text,
  amount_kobo        bigint NOT NULL CHECK (amount_kobo > 0),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
  sender_name        text,
  session_id         text UNIQUE,
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz
);
-- VFD may recycle temporary account numbers, so they are not unique: match the newest deposit.
CREATE INDEX IF NOT EXISTS deposits_account ON deposits(account_number, created_at DESC);
CREATE INDEX IF NOT EXISTS deposits_pending ON deposits(status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS sprays (
  id          bigserial PRIMARY KEY,
  party_id    text NOT NULL REFERENCES parties(id),
  wallet_id   text NOT NULL REFERENCES wallets(id),
  guest_name  text NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  leftover    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sprays_party ON sprays(party_id, id);

-- Payment to the celebrant when the host closes the party.
CREATE TABLE IF NOT EXISTS payouts (
  id               text PRIMARY KEY,
  party_id         text NOT NULL UNIQUE REFERENCES parties(id),
  reference        text NOT NULL UNIQUE,
  gross_kobo       bigint NOT NULL,
  spray_fee_kobo   bigint NOT NULL,
  planner_share_kobo bigint NOT NULL DEFAULT 0,
  net_kobo         bigint NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'successful', 'failed', 'nothing_to_pay')),
  vfd_code         text,
  vfd_session_id   text,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Every inward credit we hear about, kept for reconciliation (matched or not).
CREATE TABLE IF NOT EXISTS credit_events (
  event_id    text PRIMARY KEY,
  account_number text,
  amount_kobo bigint,
  outcome     text NOT NULL,
  reason      text,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
