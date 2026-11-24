// In-memory pretend bank for tests and for SPRAY_FAKE_BANK=true local demos. Never used with real money.
import type { PayoutResult, VfdPort } from "./vfd-port";
import type { TransactionStatus } from "./vfd/transfers";

export class FakeVfd implements VfdPort {
  environment = "sandbox" as const;
  bankName = "VFD Microfinance Bank";
  accounts = new Map<string, { reference: string; amountKobo: number }>();
  credits = new Map<string, { sessionId: string; accountNo: string; amountKobo: number }>(); // by reference
  payouts: { reference: string; amountKobo: number; accountNumber: string }[] = [];
  payoutAnswer: PayoutResult = { accepted: true, code: "00", sessionId: "PAYSESSION" };
  private n = 0;
  static accountSeq = 0;

  async createDepositAccount(input: { reference: string; amountKobo: number }) {
    const accountNumber = String(4000000000 + ++FakeVfd.accountSeq);
    this.accounts.set(accountNumber, { reference: input.reference, amountKobo: input.amountKobo });
    return { accountNumber };
  }
  /** Test helper: a guest's bank transfer lands on the virtual account. */
  transferIn(accountNumber: string, amountKobo?: number) {
    const acc = this.accounts.get(accountNumber)!;
    const sessionId = `SESS${++FakeVfd.accountSeq}`;
    this.credits.set(acc.reference, { sessionId, accountNo: accountNumber, amountKobo: amountKobo ?? acc.amountKobo });
    return { sessionId, reference: acc.reference };
  }
  private status(c: { sessionId: string; accountNo: string; amountKobo: number } | undefined): TransactionStatus {
    if (!c) return { found: false, outcome: "pending", conclusive: false, code: null, amountKobo: null, sessionId: null, accountNo: null, fromAccountNo: null, transactionId: null };
    return { found: true, outcome: "successful", conclusive: true, code: "00", amountKobo: c.amountKobo, sessionId: c.sessionId, accountNo: c.accountNo, fromAccountNo: "1234567890", transactionId: "T1" };
  }
  async statusByReference(reference: string) {
    const payout = this.payouts.find((p) => p.reference === reference);
    if (payout) return this.status({ sessionId: "PAYSESSION", accountNo: payout.accountNumber, amountKobo: payout.amountKobo });
    return this.status(this.credits.get(reference));
  }
  async statusBySession(sessionId: string) { return this.status([...this.credits.values()].find((c) => c.sessionId === sessionId)); }
  async lookupAccountName(_bank: string, accountNumber: string) { return accountNumber === "0000000000" ? null : "ADAEZE OKAFOR"; }
  async banks() { return [{ code: "999999", name: "VFD" }]; }
  async pay(input: { reference: string; amountKobo: number; accountNumber: string }) {
    if (this.payoutAnswer.accepted) this.payouts.push(input);
    return this.payoutAnswer;
  }
  async simulateCredit(accountNumber: string) { this.transferIn(accountNumber); }
}

