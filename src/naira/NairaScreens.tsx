import { useEffect, useRef, useState } from "react";
import { Qr } from "../Qr";
import { enableSound, Rain, type RainHandle } from "../Rain";
import { links, naira } from "./api";
import { useNairaParty } from "./useNairaParty";

function Missing() {
  return (
    <main className="host">
      <h1>This party link doesn't exist.</h1>
      <p className="lede">Ask the host to share it again, or <a href="#/n/new">start your own party</a>.</p>
    </main>
  );
}

/** Projector view: QR to spray, live total, leaderboard and the money rain. */
export function NairaScreen({ partyId }: { partyId: string }) {
  const rain = useRef<RainHandle>(null);
  const [sound, setSound] = useState(false);
  const { party, status } = useNairaParty(partyId, (name, kobo) => rain.current?.spray(name, kobo / 100, "NGN"));
  if (status === "missing") return <Missing />;
  const url = links.guest(partyId);

  return (
    <main className="screen">
      <Rain ref={rain} mark="" />
      <section className="screen-main">
        <p className="eyebrow">{party?.title ?? "Loading…"}</p>
        <h1 className="celebrant">Spray {party?.celebrant ?? ""}!</h1>
        <div className="total">
          <span className="total-ngn">{naira(party?.totals.sprayedKobo ?? 0)}</span>
          <span className="total-sub">
            {party?.totals.sprays ?? 0} {party?.totals.sprays === 1 ? "spray" : "sprays"} · {party?.totals.guests ?? 0} {party?.totals.guests === 1 ? "guest" : "guests"}
          </span>
        </div>
        <div className="feed">
          {party && party.recent.length === 0 && <p className="empty">No sprays yet. Scan the code, load your bundle and start spraying.</p>}
          {party?.recent.map((s, i) => (
            <div key={`${s.at}-${i}`} className="feed-row">
              <b>{s.name}</b> sprayed <b>{naira(s.amountKobo)}</b>
            </div>
          ))}
        </div>
        {party?.status === "closed" && <p className="closed-note">This party has ended. Thank you for spraying! 🎉</p>}
      </section>

      <aside className="screen-side">
        <div className="scan">
          <Qr value={url} size={230} />
          <p className="scan-title">Scan to spray</p>
          <p className="scan-sub">Pay by bank transfer · no app needed</p>
        </div>
        <div className="board">
          <h2>Top sprayers</h2>
          {party && party.leaderboard.length === 0 && <p className="empty">Waiting for the first big spender…</p>}
          <ol>
            {party?.leaderboard.slice(0, 5).map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <span className="rank">{["👑", "2", "3", "4", "5"][i]}</span>
                <span className="who">{r.name}</span>
                <span className="amt">{naira(r.amountKobo)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="screen-tools">
          <span className={`dot ${status === "live" ? "live" : status === "loading" ? "loading" : "offline"}`} />
          {status === "live" ? "Live" : status === "loading" ? "Connecting…" : "Reconnecting…"}
          {!sound && <button className="btn link" onClick={() => { enableSound(); setSound(true); }}>🔊 Sound on</button>}
          <button className="btn link" onClick={() => rain.current?.spray("Test", 500, "NGN")}>Test rain</button>
        </div>
      </aside>
    </main>
  );
}

/** Transparent OBS overlay for live streams. */
export function NairaOverlay({ partyId }: { partyId: string }) {
  const rain = useRef<RainHandle>(null);
  const { party } = useNairaParty(partyId, (name, kobo) => rain.current?.spray(name, kobo / 100, "NGN"));
  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    return () => document.documentElement.classList.remove("overlay-mode");
  }, []);
  return (
    <main className="overlay">
      <Rain ref={rain} mark="" />
      <div className="ticker">
        <span className="ticker-label">Spray {party?.celebrant ?? ""}</span>
        <span className="ticker-total">{naira(party?.totals.sprayedKobo ?? 0)}</span>
        {party?.leaderboard[0] && <span className="ticker-top">👑 {party.leaderboard[0].name}</span>}
      </div>
    </main>
  );
}
