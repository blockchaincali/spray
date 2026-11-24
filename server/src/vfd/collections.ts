import { VfdApiError, type VfdClient } from "./client";
import { assertSandboxOnly, koboToNaira } from "./config";

export interface VirtualAccount {
  accountNumber: string;
  reference: string;
}

export interface PaymentLink {
  paymentLink: string;
  paymentReference: string;
  expireAt: string | null;
}

/**
 * Temporary exact-amount virtual account (Wallets API `POST /virtualaccount`).
 * `A0` = exact amount only, so under/over payments are not auto-accepted.
 */
export async function createVirtualAccount(client: VfdClient, input: {
  reference: string;
  amountKobo: number;
  merchantName: string;
  merchantId: string;
  validityMinutes: number;
}): Promise<VirtualAccount> {
  const body = await client.request<{ accountNumber?: string; reference?: string }>(client.config.urls.wallet, "/virtualaccount", {
    method: "POST",
    body: {
      amount: String(koboToNaira(input.amountKobo)),
      merchantName: input.merchantName,
      merchantId: input.merchantId,
      reference: input.reference,
      validityTime: String(Math.min(4320, Math.max(1, input.validityMinutes))),
      amountValidation: "A0",
    },
  });
  if (body.status === "00" && body.accountNumber) {
    return { accountNumber: body.accountNumber, reference: body.reference ?? input.reference };
  }
  // 98 = reference already exists: the account may have been created by an
  // earlier timed-out call whose number we never received. Do not guess.
  const uncertain = body.status === "98";
  throw new VfdApiError(`VFD virtual account rejected: ${body.message ?? body.status ?? "unknown"}`, null, body.status ?? null, uncertain);
}

/** Payment Link API `POST /merchant/setup` (idempotent create-or-update by merchantId). */
export async function setupPaymentLinkMerchant(client: VfdClient, input: { merchantName: string; merchantId?: string }): Promise<string> {
  const body = await client.request<{ merchantId?: string }>(client.config.urls.paymentLink, "/merchant/setup", {
    method: "POST",
    body: { merchantName: input.merchantName, ...(input.merchantId ? { merchantId: input.merchantId } : {}) },
  });
  if (body.status !== "00" || !body.merchantId) {
    throw new VfdApiError(`VFD merchant setup rejected: ${body.message ?? body.status ?? "unknown"}`, null, body.status ?? null, false);
  }
  return body.merchantId;
}

/** Payment Link API `POST /generate-link` with an exact-amount (`A0`) link. */
export async function generatePaymentLink(client: VfdClient, input: {
  reference: string;
  amountKobo: number;
  description: string;
  merchantId: string;
  merchantName: string;
  validityMinutes: number;
}): Promise<PaymentLink> {
  const body = await client.request<{ data?: { paymentLink?: string; paymentReference?: string; expireAt?: string } }>(
    client.config.urls.paymentLink,
    "/generate-link",
    {
      method: "POST",
      body: {
        amount: String(koboToNaira(input.amountKobo)),
        amountValidation: "A0",
        description: input.description,
        paymentReference: input.reference,
        merchantId: input.merchantId,
        merchantName: input.merchantName,
        validityTime: String(Math.min(4320, Math.max(1, input.validityMinutes))),
      },
    },
  );
  const data = body.data;
  if (body.status !== "00" || !data?.paymentLink) {
    throw new VfdApiError(`VFD payment link rejected: ${body.message ?? body.status ?? "unknown"}`, null, body.status ?? null, false);
  }
  return { paymentLink: data.paymentLink, paymentReference: data.paymentReference ?? input.reference, expireAt: data.expireAt ?? null };
}

/**
 * Documented sandbox sender for the credit simulator. The Wallets API page is inconsistent: its note
 * names 5050104070 while the sample body uses 5050104057 (both with bank 000002). Override if VFD
 * says otherwise.
 */
export const VFD_SIMULATOR_DEFAULT_SENDER = { accountNo: "5050104070", bank: "000002" } as const;

/**
 * Sandbox credit simulator, Wallets API `POST /credit` ("simulate an inflow on the dev environment").
 * Hard-blocked outside sandbox. A `00` answer only means VFD accepted the simulation; the payment is
 * still confirmed through the normal webhook + status-query path, never by this response.
 */
export async function simulateInwardCredit(client: VfdClient, input: {
  accountNo: string;
  amountKobo: number;
  senderAccountNo?: string;
  senderBank?: string;
  narration?: string;
}): Promise<{ status: string | null; message: string | null }> {
  assertSandboxOnly(client.config);
  if (!/^\d{10}$/.test(input.accountNo)) throw new Error("accountNo must be a 10-digit account number");
  if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) throw new Error("amountKobo must be a positive integer");
  const body = await client.request<Record<string, never>>(client.config.urls.wallet, "/credit", {
    method: "POST",
    body: {
      amount: String(koboToNaira(input.amountKobo)),
      accountNo: input.accountNo,
      senderAccountNo: input.senderAccountNo ?? VFD_SIMULATOR_DEFAULT_SENDER.accountNo,
      senderBank: input.senderBank ?? VFD_SIMULATOR_DEFAULT_SENDER.bank,
      senderNarration: input.narration ?? "ShopSwift sandbox test",
    },
  });
  if (body.status !== "00") {
    throw new VfdApiError(`VFD credit simulator rejected: ${body.message ?? body.status ?? "unknown"}`, null, body.status ?? null, false);
  }
  return { status: body.status ?? null, message: body.message ?? null };
}
