import crypto from "node:crypto";
import { VfdApiError, type VfdClient } from "./client";
import { koboToNaira, nairaToKobo } from "./config";

export type TransferType = "intra" | "inter";
export type TsqOutcome = "successful" | "pending" | "failed";

// Wallets API "transactionStatus" table. `tsqRequired` codes are failures the
// docs say must be confirmed with a status query before being believed.
const PENDING_CODES = new Set(["01", "02", "09", "25", "94", "96", "500"]);
const FAILED_CODES = new Set(["03", "05", "06", "07", "08", "12", "13", "14", "15", "16", "17", "18", "21", "30", "57", "58", "61", "65", "81", "92", "97", "99"]);
const FAILED_NEEDS_TSQ = new Set(["91", "98"]);

export interface ClassifiedStatus { outcome: TsqOutcome; conclusive: boolean }

/**
 * Maps a VFD transactionStatus code. Unknown codes are PENDING and
 * inconclusive: an unrecognised code must never settle or fail a payout.
 */
export function classifyTransactionStatus(code: string | null | undefined): ClassifiedStatus {
  if (code === "00") return { outcome: "successful", conclusive: true };
  if (code != null && PENDING_CODES.has(code)) return { outcome: "pending", conclusive: false };
  if (code != null && FAILED_CODES.has(code)) return { outcome: "failed", conclusive: true };
  if (code != null && FAILED_NEEDS_TSQ.has(code)) return { outcome: "failed", conclusive: false };
  // null/undefined = "failed with reversal" per docs, which also requires TSQ.
  return { outcome: code == null ? "failed" : "pending", conclusive: false };
}

export interface SenderAccount { accountNo: string; clientId: string; client: string; accountId: string; balanceKobo: number | null }

/** Without an account number VFD returns the wallet's pool account (Wallets API, Account Enquiry). */
export async function accountEnquiry(client: VfdClient, accountNumber?: string): Promise<SenderAccount> {
  const path = accountNumber ? `/account/enquiry?accountNumber=${encodeURIComponent(accountNumber)}` : "/account/enquiry";
  const body = await client.request<{ data?: Record<string, unknown> }>(client.config.urls.wallet, path, { method: "GET" });
  const d = body.data;
  if (body.status !== "00" || !d) throw new VfdApiError(`VFD account enquiry failed: ${body.message ?? body.status ?? "unknown"}`, null, body.status ?? null, false);
  const balance = Number(d.accountBalance);
  return {
    accountNo: String(d.accountNo ?? accountNumber ?? ""),
    clientId: String(d.clientId ?? ""),
    client: String(d.client ?? ""),
    accountId: String(d.accountId ?? ""),
    balanceKobo: Number.isFinite(balance) ? nairaToKobo(balance) : null,
  };
}

/**
 * The collection (pool) account must be read WITHOUT an account number: VFD answers
 * "Account Not Found" when the pool account is passed as `accountNumber` (seen in the
 * sandbox, 2026-11-04). We still check the returned pool is the one configured, so a
 * key for the wrong wallet can never become the payout sender.
 */
export async function poolAccountEnquiry(client: VfdClient, expectedAccountNumber: string): Promise<SenderAccount> {
  const pool = await accountEnquiry(client);
  if (pool.accountNo !== expectedAccountNumber) {
    throw new VfdApiError("VFD pool account does not match VFD_COLLECTION_ACCOUNT_NUMBER", null, null, false);
  }
  return pool;
}

export interface BeneficiaryLookup {
  name: string;
  accountNumber: string;
  bankCode: string;
  clientId: string | null;
  bvn: string | null;
  /** `account.id` from the lookup: savings id for intra transfers. */
  accountId: string | null;
  status: string | null;
}

export async function lookupRecipient(client: VfdClient, input: { accountNumber: string; bankCode: string; transferType: TransferType }): Promise<BeneficiaryLookup | null> {
  const query = `accountNo=${encodeURIComponent(input.accountNumber)}&bank=${encodeURIComponent(input.bankCode)}&transfer_type=${input.transferType}`;
  const body = await client.request<{ data?: Record<string, unknown> }>(client.config.urls.wallet, `/transfer/recipient?${query}`, { method: "GET" });
  if (body.status === "104") return null; // documented "Account Not Found"
  const d = body.data;
  if (body.status !== "00" || !d) throw new VfdApiError(`VFD recipient lookup failed: ${body.message ?? body.status ?? "unknown"}`, null, body.status ?? null, false);
  const account = (d.account ?? {}) as Record<string, unknown>;
  return {
    name: String(d.name ?? ""),
    accountNumber: String(account.number ?? input.accountNumber),
    bankCode: input.bankCode,
    clientId: d.clientId == null ? null : String(d.clientId),
    bvn: d.bvn == null ? null : String(d.bvn),
    accountId: account.id == null ? null : String(account.id),
    status: d.status == null ? null : String(d.status),
  };
}

export interface VfdBank { code: string; name: string }

export async function listBanks(client: VfdClient): Promise<VfdBank[]> {
  // The docs publish no sample response for /bank, so parse defensively and
  // return nothing rather than mis-mapped codes.
  const body = await client.request<{ data?: unknown }>(client.config.urls.wallet, "/bank", { method: "GET" });
  const raw = Array.isArray(body.data) ? body.data : (body.data as { bank?: unknown } | undefined)?.bank;
  if (body.status !== "00" || !Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const r = row as Record<string, unknown>;
    const code = r.code ?? r.bankCode;
    const name = r.name ?? r.bankName;
    return code != null && name != null ? [{ code: String(code), name: String(name) }] : [];
  });
}

/** Documented signature: SHA512 of fromAccount + toAccount (exact scheme must be confirmed with VFD). */
export function transferSignature(fromAccount: string, toAccount: string): string {
  return crypto.createHash("sha512").update(`${fromAccount}${toAccount}`).digest("hex");
}

export interface TransferRequest {
  sender: SenderAccount;
  beneficiary: BeneficiaryLookup;
  transferType: TransferType;
  amountKobo: number;
  reference: string;
  remark: string;
  /** Inter-bank session id for the beneficiary, when VFD supplies one. */
  toSession?: string;
}

export interface TransferInitiation { accepted: boolean; txnId: string | null; sessionId: string | null; code: string | null }

/**
 * Posts the transfer. Resolves `accepted:false` only for definitive pre-processing
 * rejections. Network errors / 5xx throw an `uncertain` VfdApiError and an
 * "already exists" (98) answer is reported accepted=false with code 98 so the
 * caller checks status instead of retrying.
 */
export async function initiateTransfer(client: VfdClient, input: TransferRequest): Promise<TransferInitiation> {
  const payload: Record<string, unknown> = {
    fromAccount: input.sender.accountNo,
    fromClientId: input.sender.clientId,
    fromClient: input.sender.client,
    fromSavingsId: input.sender.accountId,
    toAccount: input.beneficiary.accountNumber,
    toBank: input.beneficiary.bankCode,
    toClient: input.beneficiary.name,
    signature: transferSignature(input.sender.accountNo, input.beneficiary.accountNumber),
    amount: String(koboToNaira(input.amountKobo)),
    remark: input.remark,
    transferType: input.transferType,
    reference: input.reference,
  };
  if (input.beneficiary.bvn) payload.toBvn = input.beneficiary.bvn;
  if (input.transferType === "intra") {
    payload.toClientId = input.beneficiary.clientId;
    payload.toSavingsId = input.beneficiary.accountId;
  } else {
    // Docs: toSession is "Mandatory(Inter)" yet the published sample sends "" and no endpoint is
    // documented that returns it. Send the documented key; VFD's answer decides (see docs/vfd-payments.md).
    payload.toSession = input.toSession ?? "";
  }
  const body = await client.request<{ data?: { txnId?: string; sessionId?: string } }>(client.config.urls.wallet, "/transfer", { method: "POST", body: payload });
  const code = body.status ?? null;
  return {
    accepted: code === "00",
    txnId: body.data?.txnId ?? null,
    sessionId: body.data?.sessionId ?? null,
    code,
  };
}

export interface TransactionStatus {
  found: boolean;
  outcome: TsqOutcome;
  conclusive: boolean;
  code: string | null;
  amountKobo: number | null;
  sessionId: string | null;
  accountNo: string | null;
  fromAccountNo: string | null;
  transactionId: string | null;
}

/** Transaction status query. Exactly one of reference / sessionId is required. */
export async function queryTransactionStatus(client: VfdClient, by: { reference: string } | { sessionId: string }): Promise<TransactionStatus> {
  const query = "reference" in by ? `reference=${encodeURIComponent(by.reference)}` : `sessionId=${encodeURIComponent(by.sessionId)}`;
  const body = await client.request<{ data?: Record<string, unknown> }>(client.config.urls.wallet, `/transactions?${query}`, { method: "GET" });
  const empty = { amountKobo: null, sessionId: null, accountNo: null, fromAccountNo: null, transactionId: null, code: null } as const;
  if (body.status === "108") return { found: false, outcome: "pending", conclusive: false, ...empty };
  const d = body.data;
  if (body.status !== "00" || !d) throw new VfdApiError(`VFD status query failed: ${body.message ?? body.status ?? "unknown"}`, null, body.status ?? null, true);
  const code = d.transactionStatus == null ? null : String(d.transactionStatus);
  const amount = Number(d.amount);
  return {
    found: true,
    ...classifyTransactionStatus(code),
    code,
    amountKobo: Number.isFinite(amount) ? nairaToKobo(amount) : null,
    sessionId: d.sessionId == null ? null : String(d.sessionId),
    accountNo: d.accountNo == null ? null : String(d.accountNo),
    fromAccountNo: d.fromAccountNo == null ? null : String(d.fromAccountNo),
    transactionId: d.TxnId == null ? null : String(d.TxnId),
  };
}
