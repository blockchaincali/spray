import { createHash, randomBytes } from "node:crypto";
import { payoutSplit, type SprayConfig } from "./config";
import { inTx, type Db, type Tx } from "./db";
import type { VfdPort } from "./vfd-port";
import type { InwardCredit } from "./vfd/webhook";

export class SprayError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) { super(message); }
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;
const cleanName = (value: unknown, max = 40) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export interface SprayEvent {
  type: "spray" | "deposit" | "closed";
  partyId: string;
  name?: string;
  amountKobo?: number;
  leftover?: boolean;
  at: string;
}

export type Publish = (event: SprayEvent) => void;

export interface PartyView {
  id: string;
  title: string;
  celebrant: string;
  status: "live" | "closed";
  payoutAccountName: string;
  totals: { sprayedKobo: number; sprays: number; guests: number };
  leaderboard: { name: string; amountKobo: number; sprays: number }[];
  recent: { name: string; amountKobo: number; at: string }[];
}

export class SprayService {
  constructor(
    private readonly db: Db,
    private readonly vfd: VfdPort,
    private readonly config: SprayConfig,
    private readonly publish: Publish = () => {},
  ) {}

  // ---------- Parties ----------

  async createParty(input: { title?: unknown; celebrant?: unknown; planner?: unknown; bankCode?: unknown; accountNumber?: unknown }) {
    const celebrant = cleanName(input.celebrant);
    const bankCode = String(input.bankCode ?? "").trim();
    const accountNumber = String(input.accountNumber ?? "").trim();
    if (!celebrant) throw new SprayError(400, "CELEBRANT_REQUIRED");
    if (!/^\d{3,6}$/.test(bankCode)) throw new SprayError(400, "BANK_REQUIRED");
    if (!/^\d{10}$/.test(accountNumber)) throw new SprayError(400, "ACCOUNT_NUMBER_INVALID", "Account number must be 10 digits");
    // Confirm the payout account exists and show its real name to the host before money flows.
    const accountName = await this.vfd.lookupAccountName(bankCode, accountNumber);
    if (!accountName) throw new SprayError(400, "ACCOUNT_NOT_FOUND", "That bank account could not be found");
    const id = newId("p"), hostToken = newToken();
    const title = cleanName(input.title, 60) || `${celebrant}'s party`;
    await this.db.query(
      `INSERT INTO parties (id, title, celebrant, planner, host_token_hash, payout_bank_code, payout_account_number, payout_account_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, title, celebrant, cleanName(input.planner, 60) || null, hash(hostToken), bankCode, accountNumber, accountName],
    );
    return { partyId: id, hostToken, title, celebrant, payoutAccountName: accountName };
  }

  async party(partyId: string): Promise<PartyView> {
    const { rows: [p] } = await this.db.query(`SELECT * FROM parties WHERE id = $1`, [partyId]);
    if (!p) throw new SprayError(404, "PARTY_NOT_FOUND");
    const [{ rows: [totals] }, { rows: board }, { rows: recent }] = await Promise.all([
      this.db.query(`SELECT COALESCE(SUM(amount_kobo),0)::bigint AS sprayed, COUNT(*)::bigint AS sprays, COUNT(DISTINCT wallet_id)::bigint AS guests FROM sprays WHERE party_id = $1`, [partyId]),
      this.db.query(`SELECT MIN(guest_name) AS name, SUM(amount_kobo)::bigint AS amount, COUNT(*)::bigint AS sprays FROM sprays WHERE party_id = $1 GROUP BY wallet_id ORDER BY SUM(amount_kobo) DESC LIMIT 10`, [partyId]),
      this.db.query(`SELECT guest_name AS name, amount_kobo AS amount, created_at FROM sprays WHERE party_id = $1 ORDER BY id DESC LIMIT 8`, [partyId]),
    ]);
    return {
      id: p.id, title: p.title, celebrant: p.celebrant, status: p.status, payoutAccountName: p.payout_account_name,
      totals: { sprayedKobo: totals.sprayed, sprays: totals.sprays, guests: totals.guests },
      leaderboard: board.map((r) => ({ name: r.name, amountKobo: r.amount, sprays: r.sprays })),
      recent: recent.map((r) => ({ name: r.name, amountKobo: r.amount, at: new Date(r.created_at).toISOString() })),
    };
  }

  private async requireHost(partyId: string, hostToken: string | undefined) {
    const { rows: [p] } = await this.db.query(`SELECT * FROM parties WHERE id = $1`, [partyId]);
    if (!p) throw new SprayError(404, "PARTY_NOT_FOUND");
    if (!hostToken || hash(hostToken) !== p.host_token_hash) throw new SprayError(403, "NOT_HOST");
    return p;
  }

  // ---------- Guests and bundles ----------

  async joinParty(partyId: string, input: { name?: unknown }) {
    const name = cleanName(input.name);
    if (!name) throw new SprayError(400, "NAME_REQUIRED");
    const { rows: [p] } = await this.db.query(`SELECT status FROM parties WHERE id = $1`, [partyId]);
    if (!p) throw new SprayError(404, "PARTY_NOT_FOUND");
    if (p.status !== "live") throw new SprayError(409, "PARTY_CLOSED");
    const id = newId("w"), guestToken = newToken();
    await this.db.query(`INSERT INTO wallets (id, party_id, guest_name, guest_token_hash) VALUES ($1,$2,$3,$4)`, [id, partyId, name, hash(guestToken)]);
    return { walletId: id, guestToken, name };
  }

  private async requireWallet(walletId: string, guestToken: string | undefined, tx?: Tx) {
    const q = tx ?? this.db;
    const { rows: [w] } = await q.query(`SELECT w.*, p.status AS party_status, p.title, p.celebrant FROM wallets w JOIN parties p ON p.id = w.party_id WHERE w.id = $1`, [walletId]);
    if (!w) throw new SprayError(404, "WALLET_NOT_FOUND");
    if (!guestToken || hash(guestToken) !== w.guest_token_hash) throw new SprayError(403, "NOT_YOUR_WALLET");
    return w;
  }

  async wallet(walletId: string, guestToken: string | undefined) {
    const w = await this.requireWallet(walletId, guestToken);
    const { rows: deposits } = await this.db.query(
      `SELECT id, account_number, amount_kobo, status, expires_at, paid_at FROM deposits WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 5`, [walletId]);
    return {
      walletId: w.id, partyId: w.party_id, name: w.guest_name, balanceKobo: w.balance_kobo, loadedKobo: w.loaded_kobo,
      partyStatus: w.party_status,
      deposits: deposits.map((d) => this.depositView(d)),
    };
  }

  private depositView(d: { id: string; account_number: string | null; amount_kobo: number; status: string; expires_at: Date; paid_at: Date | null }) {
    return {
      depositId: d.id, accountNumber: d.account_number, bankName: this.vfd.bankName, amountKobo: d.amount_kobo,
      status: d.status, expiresAt: new Date(d.expires_at).toISOString(), paidAt: d.paid_at ? new Date(d.paid_at).toISOString() : null,
    };
  }

  /** Opens an exact-amount virtual account for one bundle top-up. */
  async startDeposit(walletId: string, guestToken: string | undefined, input: { amountKobo?: unknown }) {
    const w = await this.requireWallet(walletId, guestToken);
    if (w.party_status !== "live") throw new SprayError(409, "PARTY_CLOSED");
    const amountKobo = Number(input.amountKobo);
    if (!Number.isSafeInteger(amountKobo) || amountKobo % 100 !== 0) throw new SprayError(400, "AMOUNT_INVALID", "Amount must be whole naira");
    if (amountKobo < this.config.minDepositKobo || amountKobo > this.config.maxDepositKobo) {
      throw new SprayError(400, "AMOUNT_OUT_OF_RANGE", `Bundles are ₦${this.config.minDepositKobo / 100}–₦${this.config.maxDepositKobo / 100}`);
    }
    // One open bundle at a time per guest: reuse it if it's for the same amount, so double taps don't open two accounts.
    const { rows: [open] } = await this.db.query(
      `SELECT * FROM deposits WHERE wallet_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [walletId]);
    if (open && open.amount_kobo === amountKobo && open.account_number) return this.depositView(open);
    if (open) await this.db.query(`UPDATE deposits SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [open.id]);

    const id = newId("d");
    const reference = `${(process.env.VFD_WALLET_NAME ?? "SPRAY").replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}S${randomBytes(12).toString("hex")}`;
    const expiresAt = new Date(Date.now() + this.config.depositValidityMinutes * 60_000);
    await this.db.query(
      `INSERT INTO deposits (id, wallet_id, party_id, reference, amount_kobo, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, walletId, w.party_id, reference, amountKobo, expiresAt],
    );
    let accountNumber: string;
    try {
      ({ accountNumber } = await this.vfd.createDepositAccount({
        reference, amountKobo, label: `Spray ${w.celebrant}`, partyId: w.party_id, validityMinutes: this.config.depositValidityMinutes,
      }));
    } catch (error) {
      await this.db.query(`UPDATE deposits SET status = 'failed' WHERE id = $1`, [id]);
      throw new SprayError(502, "BANK_UNAVAILABLE", "Couldn't open a transfer account right now. Please try again.");
    }
    const { rows: [d] } = await this.db.query(`UPDATE deposits SET account_number = $2 WHERE id = $1 RETURNING *`, [id, accountNumber]);
    return this.depositView(d);
  }

  /** Sandbox only: pretend the guest's bank transfer arrived, then confirm it the normal way. */
  async simulateDeposit(walletId: string, guestToken: string | undefined, depositId: string) {
    if (this.vfd.environment !== "sandbox") throw new SprayError(404, "NOT_FOUND");
    const w = await this.requireWallet(walletId, guestToken);
    const { rows: [d] } = await this.db.query(`SELECT * FROM deposits WHERE id = $1 AND wallet_id = $2`, [depositId, walletId]);
    if (!d?.account_number) throw new SprayError(404, "DEPOSIT_NOT_FOUND");
    if (d.status !== "pending") return this.depositView(d);
    await this.vfd.simulateCredit(d.account_number, d.amount_kobo, `Spray bundle ${w.guest_name}`);
    await this.checkDeposit(d.id);
    const { rows: [after] } = await this.db.query(`SELECT * FROM deposits WHERE id = $1`, [d.id]);
    return this.depositView(after);
  }

  /**
   * Asks VFD whether a pending bundle has been paid. A credit only counts when VFD's own status query
   * names this deposit's virtual account, the exact amount and a successful, conclusive outcome.
   */
  async checkDeposit(depositId: string): Promise<"paid" | "pending" | "expired"> {
    const { rows: [d] } = await this.db.query(`SELECT * FROM deposits WHERE id = $1`, [depositId]);
    if (!d || d.status !== "pending") return d?.status === "paid" ? "paid" : "expired";
    let status;
    try {
      status = await this.vfd.statusByReference(d.reference);
    } catch {
      return "pending";
    }
    if (status.found && status.outcome === "successful" && status.conclusive && status.sessionId
        && status.accountNo === d.account_number && status.amountKobo === d.amount_kobo) {
      return (await this.creditDeposit(d.id, status.sessionId, null)) ? "paid" : "pending";
    }
    if (new Date(d.expires_at).getTime() < Date.now() - 15 * 60_000) {
      // Grace period over with nothing paid: close it. A late transfer is still caught by the webhook.
      await this.db.query(`UPDATE deposits SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [d.id]);
      return "expired";
    }
    return "pending";
  }

  /** Webhook path: the notification is only a hint; VFD's status query by session decides. */
  async handleInwardCredit(credit: InwardCredit): Promise<{ outcome: string; reason?: string }> {
    const eventId = `vfd:${credit.sessionId ?? credit.reference}`;
    const record = (outcome: string, reason?: string) =>
      this.db.query(
        `INSERT INTO credit_events (event_id, account_number, amount_kobo, outcome, reason, payload) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (event_id) DO UPDATE SET outcome = EXCLUDED.outcome, reason = EXCLUDED.reason`,
        [eventId, credit.accountNumber, credit.amountKobo, outcome, reason ?? null, JSON.stringify(credit)],
      ).then(() => ({ outcome, reason }));
    if (credit.initial) return record("deferred", "INITIAL_NOTIFICATION");
    const { rows: [d] } = await this.db.query(`SELECT * FROM deposits WHERE account_number = $1 ORDER BY created_at DESC LIMIT 1`, [credit.accountNumber]);
    if (!d) return record("unmatched", "NO_DEPOSIT_FOR_ACCOUNT");
    if (d.status === "paid") return record("duplicate");
    if (!credit.sessionId) return record("deferred", "NO_SESSION_ID");
    if (credit.amountKobo !== d.amount_kobo) return record("rejected", "AMOUNT_MISMATCH");
    let status;
    try { status = await this.vfd.statusBySession(credit.sessionId); } catch { return record("deferred", "STATUS_QUERY_UNAVAILABLE"); }
    if (!status.found || status.outcome !== "successful" || !status.conclusive) return record("deferred", "NOT_CONFIRMED_BY_VFD");
    if (status.accountNo !== d.account_number || status.amountKobo !== d.amount_kobo || status.sessionId !== credit.sessionId) {
      return record("rejected", "VERIFIED_DETAILS_MISMATCH");
    }
    const credited = await this.creditDeposit(d.id, credit.sessionId, credit.originatorAccountName);
    return record(credited ? "confirmed" : "duplicate");
  }

  /** Marks the deposit paid and tops up the bundle exactly once. */
  private async creditDeposit(depositId: string, sessionId: string, senderName: string | null): Promise<boolean> {
    const result = await inTx(this.db, async (tx) => {
      const { rows: [d] } = await tx.query(
        `UPDATE deposits SET status = 'paid', paid_at = now(), session_id = $2, sender_name = COALESCE($3, sender_name)
         WHERE id = $1 AND status IN ('pending', 'expired') RETURNING *`, [depositId, sessionId, senderName]);
      if (!d) return null;
      const { rows: [w] } = await tx.query(
        `UPDATE wallets SET balance_kobo = balance_kobo + $2, loaded_kobo = loaded_kobo + $2 WHERE id = $1 RETURNING *`, [d.wallet_id, d.amount_kobo]);
      return { d, w };
    });
    if (!result) return false;
    this.publish({ type: "deposit", partyId: result.d.party_id, name: result.w.guest_name, amountKobo: result.d.amount_kobo, at: new Date().toISOString() });
    return true;
  }

  /** Background sweep over open bundles, so confirmation never depends on the webhook. */
  async sweepPendingDeposits(): Promise<number> {
    const { rows } = await this.db.query(`SELECT id FROM deposits WHERE status = 'pending' AND account_number IS NOT NULL ORDER BY created_at LIMIT 50`);
    let paid = 0;
    for (const { id } of rows) if ((await this.checkDeposit(id)) === "paid") paid++;
    return paid;
  }

  // ---------- Spraying ----------

  async spray(walletId: string, guestToken: string | undefined, input: { amountKobo?: unknown }) {
    const amountKobo = Number(input.amountKobo);
    if (!this.config.sprayAmountsKobo.includes(amountKobo)) throw new SprayError(400, "AMOUNT_NOT_ALLOWED");
    const out = await inTx(this.db, async (tx) => {
      const w = await this.requireWallet(walletId, guestToken, tx);
      if (w.party_status !== "live") throw new SprayError(409, "PARTY_CLOSED");
      const { rows: [updated] } = await tx.query(
        `UPDATE wallets SET balance_kobo = balance_kobo - $2 WHERE id = $1 AND balance_kobo >= $2 RETURNING balance_kobo`, [walletId, amountKobo]);
      if (!updated) throw new SprayError(409, "INSUFFICIENT_BALANCE", "Your bundle is empty. Load more to keep spraying.");
      await tx.query(`INSERT INTO sprays (party_id, wallet_id, guest_name, amount_kobo) VALUES ($1,$2,$3,$4)`, [w.party_id, walletId, w.guest_name, amountKobo]);
      return { partyId: w.party_id as string, name: w.guest_name as string, balanceKobo: updated.balance_kobo as number };
    });
    this.publish({ type: "spray", partyId: out.partyId, name: out.name, amountKobo, at: new Date().toISOString() });
    return { balanceKobo: out.balanceKobo };
  }

  // ---------- Closing and payout ----------

  /**
   * Host ends the party: unspent bundles are sprayed to the celebrant as leftovers, then the total minus
   * Spray's fee is sent to the celebrant's bank account. Safe to call again: it retries a failed payout.
   */
  async closeParty(partyId: string, hostToken: string | undefined) {
    const p = await this.requireHost(partyId, hostToken);
    const leftovers = await inTx(this.db, async (tx) => {
      await tx.query(`UPDATE parties SET status = 'closed', closed_at = COALESCE(closed_at, now()) WHERE id = $1`, [partyId]);
      const { rows } = await tx.query(`SELECT id, guest_name, balance_kobo FROM wallets WHERE party_id = $1 AND balance_kobo > 0 FOR UPDATE`, [partyId]);
      for (const w of rows) {
        await tx.query(`INSERT INTO sprays (party_id, wallet_id, guest_name, amount_kobo, leftover) VALUES ($1,$2,$3,$4,true)`, [partyId, w.id, w.guest_name, w.balance_kobo]);
        await tx.query(`UPDATE wallets SET balance_kobo = 0 WHERE id = $1`, [w.id]);
      }
      return rows;
    });
    for (const w of leftovers) this.publish({ type: "spray", partyId, name: w.guest_name, amountKobo: w.balance_kobo, leftover: true, at: new Date().toISOString() });
    this.publish({ type: "closed", partyId, at: new Date().toISOString() });

    const { rows: [{ gross }] } = await this.db.query(`SELECT COALESCE(SUM(amount_kobo),0)::bigint AS gross FROM sprays WHERE party_id = $1`, [partyId]);
    const split = payoutSplit(gross, this.config);
    const reference = `${(process.env.VFD_WALLET_NAME ?? "SPRAY").replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}SP${partyId.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 50);
    await this.db.query(
      `INSERT INTO payouts (id, party_id, reference, gross_kobo, spray_fee_kobo, planner_share_kobo, net_kobo, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (party_id) DO NOTHING`,
      [newId("po"), partyId, reference, split.grossKobo, split.sprayFeeKobo, split.plannerShareKobo, split.netKobo, split.netKobo > 0 ? "pending" : "nothing_to_pay"],
    );
    let { rows: [payout] } = await this.db.query(`SELECT * FROM payouts WHERE party_id = $1`, [partyId]);
    if (["pending", "failed", "sent"].includes(payout.status)) payout = await this.sendPayout(payout, p);
    return this.payoutView(payout, p);
  }

  private async sendPayout(payout: Record<string, any>, party: Record<string, any>) {
    // Never resend blindly: if VFD may already have the transfer, ask first.
    if (payout.status === "sent" || payout.status === "failed" || payout.vfd_code) {
      try {
        const status = await this.vfd.statusByReference(payout.reference);
        if (status.found && status.outcome === "successful") {
          return (await this.db.query(`UPDATE payouts SET status='successful', vfd_session_id=$2, updated_at=now() WHERE id=$1 RETURNING *`, [payout.id, status.sessionId])).rows[0];
        }
        if (status.found && !(status.outcome === "failed" && status.conclusive)) return payout; // still in flight
        // "Not found" right after sending can just mean VFD hasn't indexed it yet: wait an hour before resending.
        const ageMs = Date.now() - new Date(payout.updated_at).getTime();
        if (!status.found && payout.status === "sent" && ageMs < 60 * 60_000) return payout;
      } catch { return payout; }
    }
    try {
      const result = await this.vfd.pay({
        bankCode: party.payout_bank_code, accountNumber: party.payout_account_number, amountKobo: payout.net_kobo,
        reference: payout.reference, remark: `Spray: ${party.title}`.slice(0, 60),
      });
      const status = result.accepted ? "sent" : result.code === "98" ? "sent" : "failed";
      return (await this.db.query(`UPDATE payouts SET status=$2, vfd_code=$3, vfd_session_id=$4, updated_at=now() WHERE id=$1 RETURNING *`,
        [payout.id, status, result.code, result.sessionId])).rows[0];
    } catch (error) {
      // Unknown outcome (timeout): mark sent so the next attempt checks status instead of paying twice.
      return (await this.db.query(`UPDATE payouts SET status='sent', vfd_code='UNKNOWN', note=$2, updated_at=now() WHERE id=$1 RETURNING *`,
        [payout.id, error instanceof Error ? error.message.slice(0, 200) : "unknown"])).rows[0];
    }
  }

  async hostSummary(partyId: string, hostToken: string | undefined) {
    const p = await this.requireHost(partyId, hostToken);
    const view = await this.party(partyId);
    const { rows: [payout] } = await this.db.query(`SELECT * FROM payouts WHERE party_id = $1`, [partyId]);
    const { rows: [loaded] } = await this.db.query(`SELECT COALESCE(SUM(amount_kobo),0)::bigint AS kobo FROM deposits WHERE party_id = $1 AND status = 'paid'`, [partyId]);
    const split = payoutSplit(view.totals.sprayedKobo, this.config);
    return {
      ...view, planner: p.planner, loadedKobo: loaded.kobo,
      payoutAccount: { name: p.payout_account_name, accountNumber: `******${String(p.payout_account_number).slice(-4)}`, bankCode: p.payout_bank_code },
      estimate: split, payout: payout ? this.payoutView(payout, p) : null,
    };
  }

  private payoutView(payout: Record<string, any>, party: Record<string, any>) {
    return {
      status: payout.status, grossKobo: payout.gross_kobo, sprayFeeKobo: payout.spray_fee_kobo,
      plannerShareKobo: payout.planner_share_kobo, netKobo: payout.net_kobo, accountName: party.payout_account_name,
    };
  }

  banks() { return this.vfd.banks(); }
  get environment() { return this.vfd.environment; }
}
