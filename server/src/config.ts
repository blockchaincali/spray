type Env = Record<string, string | undefined>;

const int = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value != null && value.trim() !== "" && Number.isSafeInteger(n) && n >= 0 ? n : fallback;
};

export interface SprayConfig {
  port: number;
  databaseUrl: string;
  /** Browser origins allowed to call the API (the Spray web app). */
  allowedOrigins: string[];
  /** Spray's fee on everything sprayed, in basis points (400 = 4%). Taken from the celebrant's payout. */
  sprayFeeBps: number;
  /** Planner's cut of Spray's fee, in basis points of the fee (2500 = 25%). Reported, paid separately. */
  plannerShareBps: number;
  /** How long a bundle's virtual account stays open, in minutes. */
  depositValidityMinutes: number;
  minDepositKobo: number;
  maxDepositKobo: number;
  /** Allowed spray tap sizes, in kobo. */
  sprayAmountsKobo: number[];
  /** Seconds between background status checks of open deposits. */
  depositPollSeconds: number;
}

export function loadSprayConfig(env: Env = process.env): SprayConfig {
  return {
    port: int(env.PORT, 4100),
    databaseUrl: env.DATABASE_URL ?? "postgres://spray:spray@localhost:5432/spray",
    allowedOrigins: (env.SPRAY_ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",").map((o) => o.trim()).filter(Boolean),
    sprayFeeBps: Math.min(2000, int(env.SPRAY_FEE_BPS, 400)),
    plannerShareBps: Math.min(10_000, int(env.SPRAY_PLANNER_SHARE_BPS, 2500)),
    depositValidityMinutes: Math.max(10, int(env.SPRAY_DEPOSIT_MINUTES, 30)),
    minDepositKobo: int(env.SPRAY_MIN_DEPOSIT_KOBO, 100_000), // ₦1,000
    maxDepositKobo: int(env.SPRAY_MAX_DEPOSIT_KOBO, 50_000_000), // ₦500,000
    sprayAmountsKobo: (env.SPRAY_AMOUNTS_NAIRA ?? "200,500,1000,2000,5000")
      .split(",").map((n) => Math.round(Number(n) * 100)).filter((k) => Number.isSafeInteger(k) && k > 0),
    depositPollSeconds: Math.max(3, int(env.SPRAY_DEPOSIT_POLL_SECONDS, 8)),
  };
}

/** Spray's fee and the planner's share of it, both rounded down to whole kobo. */
export function payoutSplit(grossKobo: number, config: Pick<SprayConfig, "sprayFeeBps" | "plannerShareBps">) {
  const sprayFeeKobo = Math.floor((grossKobo * config.sprayFeeBps) / 10_000);
  const plannerShareKobo = Math.floor((sprayFeeKobo * config.plannerShareBps) / 10_000);
  return { grossKobo, sprayFeeKobo, plannerShareKobo, netKobo: grossKobo - sprayFeeKobo };
}
