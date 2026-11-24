import crypto from "node:crypto";
import { nairaToKobo } from "./config";

/**
 * VFD's docs describe no signature for the inward-credit webhook. The VBaaS portal lets us make
 * VFD send a fixed secret header with every notification (Settings -> Webhooks). We require:
 *   1. a high-entropy secret path segment (constant-time compared),
 *   2. the secret header when configured, and ALWAYS in live mode,
 *   3. an optional source-IP allowlist,
 * and (elsewhere) treat the notification as a hint only: money is confirmed
 * by an independent status query.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const ah = crypto.createHash("sha256").update(a).digest();
  const bh = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

export const MIN_WEBHOOK_SECRET_LENGTH = 24;

export type WebhookAuthResult = { ok: true } | { ok: false; reason: "NOT_CONFIGURED" | "BAD_TOKEN" | "BAD_HEADER" | "IP_NOT_ALLOWED" };

export function authenticateVfdWebhook(input: {
  providedToken: string | undefined;
  configuredSecret: string | undefined;
  allowedIps: string[];
  sourceIp: string | undefined;
  /** Value of the configured auth header on the incoming request. */
  providedHeaderValue?: string | undefined;
  configuredHeaderValue?: string | undefined;
  /** Portal "Value Prefix". VFD sends prefix + value; the prefix is not secret and is stripped. */
  configuredHeaderPrefix?: string | undefined;
  headerRequired?: boolean;
}): WebhookAuthResult {
  // Fail closed: an unconfigured secret must never mean "accept everything".
  if (!input.configuredSecret || input.configuredSecret.length < MIN_WEBHOOK_SECRET_LENGTH) return { ok: false, reason: "NOT_CONFIGURED" };
  const headerConfigured = Boolean(input.configuredHeaderValue);
  if (headerConfigured && input.configuredHeaderValue!.length < MIN_WEBHOOK_SECRET_LENGTH) return { ok: false, reason: "NOT_CONFIGURED" };
  if (input.headerRequired && !headerConfigured) return { ok: false, reason: "NOT_CONFIGURED" };
  if (!input.providedToken || !timingSafeEqualStrings(input.providedToken, input.configuredSecret)) return { ok: false, reason: "BAD_TOKEN" };
  if (headerConfigured) {
    let provided = input.providedHeaderValue?.trim();
    const prefix = input.configuredHeaderPrefix?.trim();
    if (provided && prefix && provided.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
      provided = provided.slice(prefix.length).trim();
    }
    if (!provided || !timingSafeEqualStrings(provided, input.configuredHeaderValue!)) return { ok: false, reason: "BAD_HEADER" };
  }
  if (input.allowedIps.length > 0) {
    const ip = (input.sourceIp ?? "").replace(/^::ffff:/, "");
    if (!input.allowedIps.includes(ip)) return { ok: false, reason: "IP_NOT_ALLOWED" };
  }
  return { ok: true };
}

export interface InwardCredit {
  reference: string;
  amountKobo: number;
  accountNumber: string;
  sessionId: string | null;
  originatorAccountNumber: string | null;
  originatorAccountName: string | null;
  originatorBank: string | null;
  channel: string | null;
  timestamp: string | null;
  /** "Initial" notifications are sent before settlement and must not confirm money. */
  initial: boolean;
}

/** Parses the documented inward-credit payload; returns null when unusable. */
export function parseInwardCredit(payload: unknown): InwardCredit | null {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const amount = Number(p.amount);
  const reference = typeof p.reference === "string" ? p.reference : "";
  const accountNumber = typeof p.account_number === "string" ? p.account_number : p.account_number == null ? "" : String(p.account_number);
  if (!reference || !accountNumber || !Number.isFinite(amount) || amount <= 0) return null;
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    reference,
    amountKobo: nairaToKobo(amount),
    accountNumber,
    sessionId: str(p.session_id),
    originatorAccountNumber: str(p.originator_account_number),
    originatorAccountName: str(p.originator_account_name),
    originatorBank: str(p.originator_bank),
    channel: str(p.transaction_channel),
    timestamp: str(p.timestamp),
    initial: p.initialCreditRequest === true,
  };
}

/** Stable idempotency identity for a credit: the session id when present. */
export function inwardCreditEventId(credit: InwardCredit): string {
  return `vfd-credit:${credit.sessionId ?? credit.reference}`;
}
