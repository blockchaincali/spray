import { useRef, useState } from "react";
import { satsToBch } from "./chain";
import { currencyOf, formatFiat } from "./currency";
import { EXPLORER_TX } from "./config";
import { Qr } from "./Qr";
import { enableSound, Rain, type RainHandle } from "./Rain";
import { guestUrl, type Session } from "./session";
import { useParty } from "./useParty";

/** The projector view: QR to spray, live totals, leaderboard, and the money rain. */
export function Screen({ session }: { session: Session }) {
  const rain = useRef<RainHandle>(null);
  const [sound, setSound] = useState(false);
  const party = useParty(session, (s) => rain.current?.spray(s.name, s.amount, s.currency));
  const url = guestUrl(session);

  return (
    <main className="screen">
      <Rain ref={rain} />
      <section className="screen-main">
        <p className="eyebrow">{session.title}</p>
        <h1 className="celebrant">Spray {session.celebrant}!</h1>
        <div className="total">
          <span className="total-ngn">{formatFiat(party.totals.amount, session.currency)}</span>
          <span className="total-sub">
            {party.totals.count} {party.totals.count === 1 ? "spray" : "sprays"} · {satsToBch(party.totals.sats)} BCH
          </span>
        </div>
        <div className="feed">
          {party.recent.length === 0 && party.status !== "loading" && (
            <p className="empty">No sprays yet. Be the first: scan the code and tap an amount.</p>
          )}
          {party.recent.map((s) => (
            <a key={s.txid} className="feed-row" href={EXPLORER_TX + s.txid} target="_blank" rel="noreferrer">
              <b>{s.name}</b> sprayed <b>{formatFiat(s.amount, s.currency)}</b>
              <span className={s.height > 0 ? "conf" : "conf pending"}>{s.height > 0 ? "confirmed" : "instant"}</span>
            </a>
          ))}
        </div>
      </section>

      <aside className="screen-side">
        <div className="scan">
          <Qr value={url} size={230} />
          <p className="scan-title">Scan to spray</p>
          <p className="scan-sub">Any WizardConnect BCH wallet</p>
        </div>
        <div className="board">
          <h2>Top sprayers</h2>
          {party.leaderboard.length === 0 && <p className="empty">Waiting for the first big spender…</p>}
          <ol>
            {party.leaderboard.slice(0, 5).map((r, i) => (
              <li key={r.name}>
                <span className="rank">{["👑", "2", "3", "4", "5"][i]}</span>
                <span className="who">{r.name}</span>
                <span className="amt">{formatFiat(r.amount, session.currency)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="screen-tools">
          <span className={`dot ${party.status}`} /> {party.status === "live" ? "Live on BCH mainnet" : party.status === "loading" ? "Connecting…" : "Reconnecting…"}
          {!sound && (
            <button className="btn link" onClick={() => { enableSound(); setSound(true); }}>🔊 Sound on</button>
          )}
          <button className="btn link" onClick={() => rain.current?.spray("Test", currencyOf(session.currency).tiers[2], session.currency)}>Test rain</button>
        </div>
      </aside>
    </main>
  );
}
