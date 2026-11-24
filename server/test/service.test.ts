import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { loadSprayConfig, payoutSplit } from "../src/config";
import { createDb, migrate, type Db } from "../src/db";
import { SprayService, type SprayEvent } from "../src/service";
import { FakeVfd } from "../src/fake-vfd";

const DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://spray:spray@localhost:5432/spray_test";

let db: Db;
let vfd: FakeVfd;
let events: SprayEvent[];
let service: SprayService;
const config = { ...loadSprayConfig({}), sprayFeeBps: 400, plannerShareBps: 2500 };

before(async () => {
  db = createDb(DB_URL);
  await db.query("DROP TABLE IF EXISTS credit_events, payouts, sprays, deposits, wallets, parties CASCADE");
  await migrate(db);
});
after(async () => { await db.end(); });
beforeEach(() => {
  vfd = new FakeVfd();
  events = [];
  service = new SprayService(db, vfd, config, (e) => events.push(e));
});

async function partyWithLoadedGuest(nairaLoaded = 5000) {
  const party = await service.createParty({ celebrant: "Adaeze", title: "Ada weds Tunde", bankCode: "999999", accountNumber: "1234567890", planner: "Bisi Events" });
  const guest = await service.joinParty(party.partyId, { name: "Uncle Tayo" });
  const deposit = await service.startDeposit(guest.walletId, guest.guestToken, { amountKobo: nairaLoaded * 100 });
  vfd.transferIn(deposit.accountNumber!);
  assert.equal(await service.sweepPendingDeposits(), 1);
  return { party, guest, deposit };
}

describe("parties", () => {
  it("verifies the payout account name before creating a party", async () => {
    const party = await service.createParty({ celebrant: "Adaeze", bankCode: "999999", accountNumber: "1234567890" });
    assert.equal(party.payoutAccountName, "ADAEZE OKAFOR");
    assert.ok(party.hostToken.length > 20);
    await assert.rejects(service.createParty({ celebrant: "X", bankCode: "999999", accountNumber: "0000000000" }), /ACCOUNT_NOT_FOUND|could not be found/);
    await assert.rejects(service.createParty({ celebrant: "X", bankCode: "999999", accountNumber: "123" }), /10 digits/);
  });
});

describe("bundles", () => {
  it("credits a bundle only once VFD's status query confirms the exact amount", async () => {
    const party = await service.createParty({ celebrant: "Adaeze", bankCode: "999999", accountNumber: "1234567890" });
    const guest = await service.joinParty(party.partyId, { name: "Chioma" });
    const deposit = await service.startDeposit(guest.walletId, guest.guestToken, { amountKobo: 1_000_000 });
    assert.equal(deposit.status, "pending");
    assert.match(deposit.accountNumber!, /^\d{10}$/);

    // Nothing paid yet.
    assert.equal(await service.sweepPendingDeposits(), 0);
    // Wrong amount sent: not credited.
    vfd.transferIn(deposit.accountNumber!, 500_000);
    assert.equal(await service.checkDeposit(deposit.depositId), "pending");
    assert.equal((await service.wallet(guest.walletId, guest.guestToken)).balanceKobo, 0);
    // Exact amount: credited once, even if checked twice.
    vfd.transferIn(deposit.accountNumber!);
    assert.equal(await service.checkDeposit(deposit.depositId), "paid");
    assert.equal(await service.checkDeposit(deposit.depositId), "paid");
    const wallet = await service.wallet(guest.walletId, guest.guestToken);
    assert.equal(wallet.balanceKobo, 1_000_000);
    assert.equal(events.filter((e) => e.type === "deposit").length, 1);
  });

  it("reuses an open bundle on a double tap instead of opening a second account", async () => {
    const party = await service.createParty({ celebrant: "Adaeze", bankCode: "999999", accountNumber: "1234567890" });
    const guest = await service.joinParty(party.partyId, { name: "Femi" });
    const a = await service.startDeposit(guest.walletId, guest.guestToken, { amountKobo: 500_000 });
    const b = await service.startDeposit(guest.walletId, guest.guestToken, { amountKobo: 500_000 });
    assert.equal(a.depositId, b.depositId);
    assert.equal(vfd.accounts.size, 1);
  });

  it("rejects other guests' tokens and out-of-range amounts", async () => {
    const party = await service.createParty({ celebrant: "Adaeze", bankCode: "999999", accountNumber: "1234567890" });
    const guest = await service.joinParty(party.partyId, { name: "Femi" });
    await assert.rejects(service.startDeposit(guest.walletId, "not-the-token", { amountKobo: 500_000 }), /NOT_YOUR_WALLET/);
    await assert.rejects(service.startDeposit(guest.walletId, guest.guestToken, { amountKobo: 50_00 }), /AMOUNT_OUT_OF_RANGE|Bundles are/);
    await assert.rejects(service.startDeposit(guest.walletId, guest.guestToken, { amountKobo: 500_050 }), /whole naira/);
  });

  it("webhook credits after verifying the session, ignores duplicates and rejects mismatches", async () => {
    const party = await service.createParty({ celebrant: "Adaeze", bankCode: "999999", accountNumber: "1234567890" });
    const guest = await service.joinParty(party.partyId, { name: "Lena" });
    const deposit = await service.startDeposit(guest.walletId, guest.guestToken, { amountKobo: 2_000_000 });
    const base = { reference: "x", accountNumber: deposit.accountNumber!, originatorAccountNumber: null, originatorAccountName: "LENA ADE", originatorBank: null, channel: null, timestamp: null, initial: false };

    // Forged notification: no such session at VFD.
    assert.equal((await service.handleInwardCredit({ ...base, amountKobo: 2_000_000, sessionId: "FAKE" })).outcome, "deferred");
    assert.equal((await service.wallet(guest.walletId, guest.guestToken)).balanceKobo, 0);
    // Wrong amount.
    assert.equal((await service.handleInwardCredit({ ...base, amountKobo: 1_000, sessionId: "FAKE" })).outcome, "rejected");

    const { sessionId } = vfd.transferIn(deposit.accountNumber!);
    assert.equal((await service.handleInwardCredit({ ...base, amountKobo: 2_000_000, sessionId })).outcome, "confirmed");
    assert.equal((await service.handleInwardCredit({ ...base, amountKobo: 2_000_000, sessionId })).outcome, "duplicate");
    assert.equal((await service.wallet(guest.walletId, guest.guestToken)).balanceKobo, 2_000_000);
  });
});

describe("spraying", () => {
  it("deducts each tap, publishes it live, and stops at an empty bundle", async () => {
    const { party, guest } = await partyWithLoadedGuest(1000);
    events = [];
    assert.equal((await service.spray(guest.walletId, guest.guestToken, { amountKobo: 50_000 })).balanceKobo, 50_000);
    assert.equal((await service.spray(guest.walletId, guest.guestToken, { amountKobo: 50_000 })).balanceKobo, 0);
    await assert.rejects(service.spray(guest.walletId, guest.guestToken, { amountKobo: 50_000 }), /bundle is empty/);
    await assert.rejects(service.spray(guest.walletId, guest.guestToken, { amountKobo: 12_300 }), /AMOUNT_NOT_ALLOWED/);
    assert.deepEqual(events.map((e) => [e.type, e.name, e.amountKobo]), [["spray", "Uncle Tayo", 50_000], ["spray", "Uncle Tayo", 50_000]]);
    const view = await service.party(party.partyId);
    assert.equal(view.totals.sprayedKobo, 100_000);
    assert.equal(view.leaderboard[0].name, "Uncle Tayo");
  });

  it("never goes below zero under concurrent taps", async () => {
    const { guest } = await partyWithLoadedGuest(1000); // ₦1,000 = two ₦500 taps
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => service.spray(guest.walletId, guest.guestToken, { amountKobo: 50_000 })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    assert.equal((await service.wallet(guest.walletId, guest.guestToken)).balanceKobo, 0);
  });
});

describe("closing", () => {
  it("sprays leftovers to the celebrant and pays out the total minus Spray's fee, once", async () => {
    const { party, guest } = await partyWithLoadedGuest(10_000);
    await service.spray(guest.walletId, guest.guestToken, { amountKobo: 200_000 }); // ₦2,000 sprayed, ₦8,000 left
    await assert.rejects(service.closeParty(party.partyId, "wrong-token"), /NOT_HOST/);

    const result = await service.closeParty(party.partyId, party.hostToken);
    const split = payoutSplit(1_000_000, config);
    assert.equal(result.grossKobo, 1_000_000);
    assert.equal(result.sprayFeeKobo, split.sprayFeeKobo); // 4% = ₦400
    assert.equal(result.plannerShareKobo, 10_000); // 25% of the fee = ₦100
    assert.equal(result.netKobo, 960_000);
    assert.equal(vfd.payouts.length, 1);
    assert.equal(vfd.payouts[0].amountKobo, 960_000);
    assert.ok(events.some((e) => e.type === "spray" && e.leftover));
    assert.equal((await service.wallet(guest.walletId, guest.guestToken)).balanceKobo, 0);

    // Closing again must not pay twice, and the party no longer accepts sprays.
    const again = await service.closeParty(party.partyId, party.hostToken);
    assert.equal(vfd.payouts.length, 1);
    assert.equal(again.status, "successful");
    await assert.rejects(service.spray(guest.walletId, guest.guestToken, { amountKobo: 50_000 }), /PARTY_CLOSED/);
  });

  it("checks status instead of resending when the payout outcome is unknown", async () => {
    const { party } = await partyWithLoadedGuest(2000);
    vfd.payoutAnswer = { accepted: false, code: "98", sessionId: null }; // "already exists": treat as sent
    const first = await service.closeParty(party.partyId, party.hostToken);
    assert.equal(first.status, "sent");
    await service.closeParty(party.partyId, party.hostToken);
    assert.equal(vfd.payouts.length, 0, "must not resend while the first transfer may be in flight");
  });
});
