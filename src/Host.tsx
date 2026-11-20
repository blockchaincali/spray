import { useState } from "react";
import { CURRENCIES, guessCurrency } from "./currency";
import { Qr } from "./Qr";
import {
  guestUrl,
  isValidAddress,
  newSessionId,
  normalizeAddress,
  overlayUrl,
  screenUrl,
  type Session,
} from "./session";
import type { Wallet } from "./useWallet";
import { primaryAddress } from "./wallet";

export function Host({ wallet }: { wallet: Wallet }) {
  const [title, setTitle] = useState("");
  const [celebrant, setCelebrant] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState(guessCurrency);
  const [session, setSession] = useState<Session | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const addrOk = isValidAddress(address);
  const canCreate = celebrant.trim().length > 0 && addrOk;

  const useMyWallet = async () => {
    const ok = await wallet.connect();
    if (ok && wallet.manager) {
      const a = primaryAddress(wallet.manager);
      if (a) setAddress(a);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setSession({
      id: newSessionId(),
      title: title.trim() || `${celebrant.trim()}'s party`,
      celebrant: celebrant.trim(),
      address: normalizeAddress(address),
      currency,
    });
  };

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  if (session) {
    const links = [
      { label: "Big screen", url: screenUrl(session), note: "Open on the projector or TV at the venue." },
      { label: "Guest spray link", url: guestUrl(session), note: "Share in the WhatsApp group, or let guests scan the QR on the big screen." },
      { label: "Stream overlay", url: overlayUrl(session), note: "Transparent page for OBS: add it as a Browser Source on top of your camera." },
    ];
    return (
      <main className="host done">
        <p className="eyebrow">Party ready</p>
        <h1>{session.title}</h1>
        <p className="lede">
          Every spray goes straight to <b>{session.celebrant}</b>'s wallet. Bookmark these links: the party lives in them.
        </p>
        <div className="host-grid">
          <div className="links">
            {links.map((l) => (
              <div className="link-row" key={l.label}>
                <div>
                  <h3>{l.label}</h3>
                  <p>{l.note}</p>
                </div>
                <div className="link-actions">
                  <a className="btn primary" href={l.url} target="_blank" rel="noreferrer">Open</a>
                  <button className="btn ghost" onClick={() => copy(l.label, l.url)}>{copied === l.label ? "Copied" : "Copy link"}</button>
                </div>
              </div>
            ))}
          </div>
          <div className="qr-card">
            <Qr value={guestUrl(session)} size={220} />
            <p>Guests scan this to spray</p>
          </div>
        </div>
        <button className="btn link" onClick={() => setSession(null)}>Start another party</button>
      </main>
    );
  }

  return (
    <main className="host">
      <p className="eyebrow">Start a spray party</p>
      <h1>Who are we spraying?</h1>
      <p className="lede">A wedding, a birthday, a live stream, a gig: anyone you want to make it rain on.</p>
      <form className="form" onSubmit={create}>
        <label>
          Celebrant's name
          <input value={celebrant} onChange={(e) => setCelebrant(e.target.value)} placeholder="Maya & Leo, or your stream name" maxLength={40} required />
        </label>
        <label>
          <span>Party name <span className="opt">(optional)</span></span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maya &amp; Leo’s wedding 💍" maxLength={50} />
        </label>
        <label>
          Spray currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.name} ({c.code})
              </option>
            ))}
          </select>
          <span className="field-note">Guests tap amounts in this currency; it's paid in BCH at the live rate.</span>
        </label>
        <label>
          Celebrant's BCH address
          <div className="addr-row">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="bitcoincash:q…"
              spellCheck={false}
              className={address && !addrOk ? "bad" : ""}
            />
            <button type="button" className="btn ghost" onClick={useMyWallet}>
              {wallet.state === "connecting" ? "Connecting…" : "Use my wallet"}
            </button>
          </div>
          {address && !addrOk && <span className="err">That doesn't look like a Bitcoin Cash address.</span>}
        </label>
        <button className="btn primary big" disabled={!canCreate}>Create party</button>
        <p className="hint">Spray never holds money. Guests pay the celebrant's address directly; a 1% platform fee keeps Spray running (skipped on the smallest sprays).</p>
      </form>
    </main>
  );
}
