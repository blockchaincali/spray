export type VfdEnvironment = "sandbox" | "live";

export interface VfdConfig {
  environment: VfdEnvironment;
  consumerKey?: string;
  consumerSecret?: string;
  walletName: string;
  collectionAccountNumber?: string;
  ownBankCode: string;
  webhookSecret?: string;
  webhookIps: string[];
  /** Header VFD adds to every webhook (portal: Settings -> Webhooks -> Authentication Key). Lower-cased. */
  webhookAuthHeader: string;
  /** Secret part of the header value (portal "Authentication Value"). */
  webhookAuthValue?: string;
  /** Portal "Value Prefix" (e.g. "Bearer"). Stripped before the secret is compared; optional. */
  webhookAuthPrefix?: string;
  /** Live mode refuses webhooks that do not carry the header. */
  webhookAuthRequired: boolean;
  /** Optional BAAS-CLIENT-PORTAL header the VBaaS portal shows in its token example (not in the API docs). */
  clientPortalHeader?: string;
  tokenValidityMinutes: number;
  collectionFeeBps: number;
  transferFeeKobo: number;
  deductFeesFromMerchant: boolean;
  tsqNotFoundGraceMinutes: number;
  urls: { auth: string; wallet: string; paymentLink: string };
}

// Base URLs are copied from the VFD VBaaS documentation (Authorization,
// Wallets API and Payment Link API pages).
const URLS: Record<VfdEnvironment, VfdConfig["urls"]> = {
  sandbox: {
    auth: "https://api-devapps.vfdbank.systems/vfd-tech/baas-portal/v1.1/baasauth/token",
    wallet: "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2",
    paymentLink: "https://api-devapps.vfdbank.systems/vtech-payment/api/v2/payments",
  },
  live: {
    auth: "https://api-apps.vfdbank.systems/vfd-tech/baas-portal/v1.1/baasauth/token",
    wallet: "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2",
    paymentLink: "https://api-apps.vfdbank.systems/vtech-payment-link/api/v2/payments",
  },
};

type Env = Record<string, string | undefined>;

function intFrom(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadVfdConfig(env: Env = process.env): VfdConfig {
  const environment: VfdEnvironment = env.VFD_ENV === "live" ? "live" : "sandbox";
  return {
    environment,
    consumerKey: env.VFD_CONSUMER_KEY || undefined,
    consumerSecret: env.VFD_CONSUMER_SECRET || undefined,
    walletName: (env.VFD_WALLET_NAME ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8),
    collectionAccountNumber: env.VFD_COLLECTION_ACCOUNT_NUMBER || undefined,
    ownBankCode: env.VFD_OWN_BANK_CODE ?? "999999",
    webhookSecret: env.VFD_WEBHOOK_SECRET || undefined,
    webhookIps: (env.VFD_WEBHOOK_IPS ?? "").split(",").map((ip) => ip.trim()).filter(Boolean),
    webhookAuthHeader: (env.VFD_WEBHOOK_AUTH_HEADER?.trim() || "x-shopswift-webhook-key").toLowerCase(),
    webhookAuthValue: env.VFD_WEBHOOK_AUTH_VALUE || undefined,
    webhookAuthPrefix: env.VFD_WEBHOOK_AUTH_PREFIX?.trim() || undefined,
    webhookAuthRequired: environment === "live",
    clientPortalHeader: env.VFD_BAAS_CLIENT_PORTAL?.trim() || undefined,
    tokenValidityMinutes: Math.max(5, intFrom(env.VFD_TOKEN_VALIDITY_MINUTES, 60)),
    // Negotiated rates are contract-dependent: always configurable, never hard-wired.
    collectionFeeBps: intFrom(env.VFD_COLLECTION_FEE_BPS, 30),
    transferFeeKobo: intFrom(env.VFD_TRANSFER_FEE_KOBO, 1000),
    deductFeesFromMerchant: env.VFD_DEDUCT_FEES_FROM_MERCHANT === "true",
    tsqNotFoundGraceMinutes: intFrom(env.VFD_TSQ_NOT_FOUND_GRACE_MINUTES, 60),
    urls: URLS[environment],
  };
}

export const VFD_SANDBOX_HOST = "api-devapps.vfdbank.systems";

/**
 * Guard for sandbox-only tooling (credit simulator, sandbox CLI). Checks both the declared
 * environment and every resolved URL, so a live URL can never be reached through these paths
 * even if the URL table were edited by mistake.
 */
export function assertSandboxOnly(config: Pick<VfdConfig, "environment" | "urls">, env: Env = process.env): void {
  if (config.environment !== "sandbox") throw new Error("Refusing: this operation is sandbox-only and VFD_ENV is not sandbox");
  if (env.NODE_ENV === "production") throw new Error("Refusing: sandbox tooling never runs with NODE_ENV=production");
  for (const url of Object.values(config.urls)) {
    if (new URL(url).hostname !== VFD_SANDBOX_HOST) throw new Error("Refusing: a configured VFD URL is not the sandbox host");
  }
}

export function vfdCredentialsConfigured(config: VfdConfig): boolean {
  return Boolean(config.consumerKey && config.consumerSecret && config.walletName && config.collectionAccountNumber);
}

/**
 * Why VFD must stay off even though VFD_ENABLED=true, or null when it may run.
 *  - Sandbox credentials never run in a production deployment, so customers are never shown a test account.
 *  - Live mode needs a separate, explicit VFD_ALLOW_LIVE=true so real money cannot move by a typo.
 *  - Live mode needs the webhook auth header value, or no live payment could ever be confirmed.
 */
export function vfdSafetyBlock(env: Env = process.env): string | null {
  if (env.VFD_ENABLED !== "true") return null;
  if (env.VFD_ENV === "live") {
    if (env.VFD_ALLOW_LIVE !== "true") return "VFD_ENV=live requires VFD_ALLOW_LIVE=true";
    // Without the portal-configured webhook header every live notification would be refused,
    // so customers could pay without their orders confirming. Keep VFD off instead.
    if ((env.VFD_WEBHOOK_AUTH_VALUE ?? "").length < 24) return "VFD_ENV=live requires VFD_WEBHOOK_AUTH_VALUE (24+ characters, set in the VBaaS portal webhook settings)";
    return null;
  }
  return env.NODE_ENV === "production" ? "sandbox VFD is never active when NODE_ENV=production (set VFD_ENV=live and VFD_ALLOW_LIVE=true for real payments)" : null;
}

/** VFD collection is usable only when explicitly enabled, fully configured and not blocked by the safety gate. */
export function vfdCollectionEnabled(env: Env = process.env): boolean {
  return env.VFD_ENABLED === "true" && vfdSafetyBlock(env) === null && vfdCredentialsConfigured(loadVfdConfig(env));
}

/**
 * True when operators asked for cutover. Routing decisions use this flag alone, so a
 * misconfigured VFD (missing credentials, VFD_ENABLED off) FAILS CLOSED: new online payments
 * are refused instead of silently falling back to legacy gateways.
 */
export function vfdCutoverRequested(env: Env = process.env): boolean {
  // Cutover is a live-money decision. In sandbox it is ignored so test runs can never remove legacy gateways.
  return env.VFD_CUTOVER_ENABLED === "true" && env.VFD_ENV === "live";
}

/** Cutover requested AND VFD is actually usable. */
export function vfdCutoverEnabled(env: Env = process.env): boolean {
  return vfdCutoverRequested(env) && vfdCollectionEnabled(env);
}

export function vfdPaymentLinkEnabled(env: Env = process.env): boolean {
  return env.VFD_PAYMENT_LINK_ENABLED === "true" && vfdCollectionEnabled(env);
}

export interface VfdFeeBreakdown {
  collectionFeeKobo: number;
  transferFeeKobo: number;
  totalFeeKobo: number;
}

export function computeVfdFees(amountKobo: number, config: Pick<VfdConfig, "collectionFeeBps" | "transferFeeKobo">): VfdFeeBreakdown {
  const collectionFeeKobo = Math.round((amountKobo * config.collectionFeeBps) / 10_000);
  return { collectionFeeKobo, transferFeeKobo: config.transferFeeKobo, totalFeeKobo: collectionFeeKobo + config.transferFeeKobo };
}

export function nairaToKobo(naira: number | string): number {
  return Math.round(Number(naira) * 100);
}

export function koboToNaira(kobo: number): number {
  return Number((kobo / 100).toFixed(2));
}
