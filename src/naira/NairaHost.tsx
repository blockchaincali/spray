import { useEffect, useMemo, useState } from "react";
import { Qr } from "../Qr";
import { api, links, naira, store, type HostSummary } from "./api";

export const hostKey = (id: string) => `spray:host:${id}`;

export function NairaHostCreate() {
  const [celebrant, setCelebrant] = useState("");
  const [title, setTitle] = useState("");
  const [planner, setPlanner] = useState("");
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [bankQuery, setBankQuery] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.banks().then((r) => setBanks(r.banks)).catch(() => setBanks([])); }, []);
  const matches = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    return q ? banks.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [bankQuery, banks]);
  const chosen = banks.find((b) => b.code === bankCode);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const p = await api.createParty({ celebrant, title, planner, bankCode, accountNumber });
      store.set(hostKey(p.partyId), p.hostToken);
      location.hash = `#/n/h/${p.partyId}`;
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <main className="host">
      <p className="eyebrow">Start a spray party · bank transfer</p>
      <h1>Who are we spraying?</h1>
      <p className="lede">Guests pay by normal bank transfer. Everything sprayed goes to the celebrant's bank account when the party ends.</p>
      <form className="form" onSubmit={create}>
        <label>Celebrant's name<input value={celebrant} onChange={(e) => setCelebrant(e.target.value)} placeholder="Adaeze & Tunde" maxLength={40} required /></label>
        <label><span>Party name <span className="opt">(optional)</span></span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ada weds Tunde 💍" maxLength={60} /></label>
        <label><span>Event planner <span className="opt">(optional)</span></span><input value={planner} onChange={(e) => setPlanner(e.target.value)} placeholder="Planner or MC handling this event" maxLength={60} /></label>
        <fieldset className="payout">
          <legend>Celebrant's payout account</legend>
          {banks.length > 0 ? (
            <label>Bank
              <input value={chosen ? chosen.name : bankQuery} onChange={(e) => { setBankCode(""); setBankQuery(e.target.value); }} placeholder="Start typing: GTBank, Access, Opay…" />
              {!chosen && matches.length > 0 && (
                <div className="bank-list">
                  {matches.map((b) => <button type="button" key={b.code} onClick={() => { setBankCode(b.code); setBankQuery(b.name); }}>{b.name}</button>)}
                </div>
              )}
            </label>
          ) : (
            <label>Bank code<input value={bankCode} onChange={(e) => setBankCode(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 999999" inputMode="numeric" /></label>
          )}
          <label>Account number<input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 digits" inputMode="numeric" required /></label>
          <span className="field-note">We'll confirm the account name before the party starts.</span>
        </fieldset>
        {error && <p className="err">{error}</p>}
        <button className="btn primary big" disabled={busy || !celebrant.trim() || !bankCode || accountNumber.length !== 10}>{busy ? "Checking account…" : "Create party"}</button>
      </form>
    </main>
  );
}

export function NairaHostDashboard({ partyId }: { partyId: string }) {
  const token = store.get(hostKey(partyId));
  const [summary, setSummary] = useState<HostSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => token && api.host(partyId, token).then(setSummary).catch((e) => setError(e.message));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [partyId]); // eslint-disable-line

  if (!token) return <main className="host"><h1>Host access needed</h1><p className="lede">Open this page on the device you created the party with.</p></main>;
  if (!summary) return <main className="host">{error ? <p className="err">{error}</p> : <p>Loading…</p>}</main>;

  const close = async () => {
    setBusy(true); setError(null);
    try { await api.close(partyId, token); setConfirming(false); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const copy = (label: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500); };
  const p = summary.payout;
  const money = p ?? summary.estimate;
  const rows = [
    { label: "Big screen", url: links.screen(partyId), note: "Open on the projector or TV at the venue." },
    { label: "Guest link", url: links.guest(partyId), note: "Share in the WhatsApp group, or let guests scan the QR." },
    { label: "Stream overlay", url: links.overlay(partyId), note: "Browser Source in OBS, on top of your camera." },
  ];

  return (
    <main className="host done">
      <p className="eyebrow">{summary.status === "live" ? "Party live" : "Party ended"}</p>
      <h1>{summary.title}</h1>
      <div className="stats host-stats">
        <div><b>{naira(summary.totals.sprayedKobo)}</b><span>sprayed</span></div>
        <div><b>{summary.totals.guests}</b><span>guests spraying</span></div>
        <div><b>{naira(summary.loadedKobo)}</b><span>loaded in bundles</span></div>
        <div><b>{summary.totals.sprays}</b><span>sprays</span></div>
      </div>

      <div className="host-grid">
        <div className="links">
          {rows.map((l) => (
            <div className="link-row" key={l.label}>
              <div><h3>{l.label}</h3><p>{l.note}</p></div>
              <div className="link-actions">
                <a className="btn primary" href={l.url} target="_blank" rel="noreferrer">Open</a>
                <button className="btn ghost" onClick={() => copy(l.label, l.url)}>{copied === l.label ? "Copied" : "Copy link"}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="qr-card"><Qr value={links.guest(partyId)} size={220} /><p>Guests scan this to spray</p></div>
      </div>

      <section className="payout-card">
        <h2>{p ? "Payout" : "Payout when the party ends"}</h2>
        <dl>
          <div><dt>Total sprayed{p ? "" : " so far"}</dt><dd>{naira(money.grossKobo)}</dd></div>
          <div><dt>Spray fee</dt><dd>−{naira(money.sprayFeeKobo)}</dd></div>
          <div className="total-row"><dt>To {summary.payoutAccount.name}</dt><dd>{naira(money.netKobo)}</dd></div>
        </dl>
        <p className="hint">{summary.payoutAccount.name} · {summary.payoutAccount.accountNumber}{summary.planner ? ` · Planner: ${summary.planner} (earns ${naira(money.plannerShareKobo)})` : ""}</p>
        {p && <p className={`payout-status s-${p.status}`}>Status: {{ pending: "preparing", sent: "sent to the bank, confirming…", successful: "paid ✓", failed: "failed, tap retry", nothing_to_pay: "nothing to pay" }[p.status] ?? p.status}</p>}
        {summary.status === "live" && !confirming && <button className="btn primary big" onClick={() => setConfirming(true)}>End party &amp; pay out</button>}
        {confirming && (
          <div className="confirm">
            <p>End the party now? Guests can't spray after this. Unspent bundles go to {summary.celebrant}, and {naira(summary.estimate.netKobo)}+ is sent to {summary.payoutAccount.name}.</p>
            <button className="btn primary" disabled={busy} onClick={close}>{busy ? "Paying out…" : "Yes, end and pay out"}</button>
            <button className="btn ghost" onClick={() => setConfirming(false)}>Not yet</button>
          </div>
        )}
        {p && (p.status === "failed" || p.status === "sent") && <button className="btn ghost" disabled={busy} onClick={close}>{p.status === "failed" ? "Retry payout" : "Check payout status"}</button>}
        {error && <p className="err">{error}</p>}
      </section>
    </main>
  );
}
