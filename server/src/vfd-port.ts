// The slice of VFD that Spray uses, behind an interface so tests can use a fake bank.
import {
  createVirtualAccount, initiateTransfer, listBanks, loadVfdConfig, lookupRecipient, poolAccountEnquiry,
  queryTransactionStatus, simulateInwardCredit, VfdClient,
  type TransactionStatus, type VfdBank, type VfdConfig,
} from "./vfd/index";

export interface PayoutResult { accepted: boolean; code: string | null; sessionId: string | null }

export interface VfdPort {
  environment: "sandbox" | "live";
  bankName: string;
  createDepositAccount(input: { reference: string; amountKobo: number; label: string; partyId: string; validityMinutes: number }): Promise<{ accountNumber: string }>;
  statusByReference(reference: string): Promise<TransactionStatus>;
  statusBySession(sessionId: string): Promise<TransactionStatus>;
  lookupAccountName(bankCode: string, accountNumber: string): Promise<string | null>;
  banks(): Promise<VfdBank[]>;
  pay(input: { bankCode: string; accountNumber: string; amountKobo: number; reference: string; remark: string }): Promise<PayoutResult>;
  /** Sandbox only: makes VFD pretend a bank transfer arrived. */
  simulateCredit(accountNumber: string, amountKobo: number, narration: string): Promise<void>;
}

export function createVfdPort(config: VfdConfig = loadVfdConfig(), bankName = process.env.VFD_DISPLAY_BANK_NAME ?? "VFD Microfinance Bank"): VfdPort {
  const client = new VfdClient(config);
  const transferType = (bankCode: string) => (bankCode === config.ownBankCode ? "intra" : "inter") as "intra" | "inter";
  let bankCache: { at: number; banks: VfdBank[] } | null = null;
  return {
    environment: config.environment,
    bankName,
    async createDepositAccount(input) {
      const account = await createVirtualAccount(client, {
        reference: input.reference, amountKobo: input.amountKobo, merchantName: input.label.slice(0, 60),
        merchantId: input.partyId, validityMinutes: input.validityMinutes,
      });
      return { accountNumber: account.accountNumber };
    },
    statusByReference: (reference) => queryTransactionStatus(client, { reference }),
    statusBySession: (sessionId) => queryTransactionStatus(client, { sessionId }),
    async lookupAccountName(bankCode, accountNumber) {
      const found = await lookupRecipient(client, { accountNumber, bankCode, transferType: transferType(bankCode) });
      return found?.name || null;
    },
    async banks() {
      if (bankCache && Date.now() - bankCache.at < 6 * 3600_000) return bankCache.banks;
      const banks = await listBanks(client);
      if (banks.length) bankCache = { at: Date.now(), banks };
      return banks;
    },
    async pay(input) {
      if (!config.collectionAccountNumber) throw new Error("VFD_COLLECTION_ACCOUNT_NUMBER is not set");
      const type = transferType(input.bankCode);
      const sender = await poolAccountEnquiry(client, config.collectionAccountNumber);
      const beneficiary = await lookupRecipient(client, { accountNumber: input.accountNumber, bankCode: input.bankCode, transferType: type });
      if (!beneficiary) return { accepted: false, code: "104", sessionId: null };
      const result = await initiateTransfer(client, {
        sender, beneficiary, transferType: type, amountKobo: input.amountKobo, reference: input.reference, remark: input.remark,
      });
      return { accepted: result.accepted, code: result.code, sessionId: result.sessionId };
    },
    async simulateCredit(accountNumber, amountKobo, narration) {
      await simulateInwardCredit(client, { accountNo: accountNumber, amountKobo, narration });
    },
  };
}
