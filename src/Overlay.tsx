import { useEffect, useRef } from "react";
import { formatFiat } from "./currency";
import { Rain, type RainHandle } from "./Rain";
import type { Session } from "./session";
import { useParty } from "./useParty";

/** Transparent page for OBS: money rains over the stream; a small ticker shows the total. */
export function Overlay({ session }: { session: Session }) {
  const rain = useRef<RainHandle>(null);
  const party = useParty(session, (s) => rain.current?.spray(s.name, s.amount, s.currency));

  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    return () => document.documentElement.classList.remove("overlay-mode");
  }, []);

  return (
    <main className="overlay">
      <Rain ref={rain} />
      <div className="ticker">
        <span className="ticker-label">Spray {session.celebrant}</span>
        <span className="ticker-total">{formatFiat(party.totals.amount, session.currency)}</span>
        {party.leaderboard[0] && <span className="ticker-top">👑 {party.leaderboard[0].name}</span>}
      </div>
    </main>
  );
}
