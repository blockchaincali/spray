import { useEffect, useRef, useState } from "react";
import { api, type PartyView } from "./api";

interface LiveEvent { type: "spray" | "deposit" | "closed"; name?: string; amountKobo?: number; leftover?: boolean; at: string }

/**
 * Live state of a naira party from the server's event stream. New sprays call `onSpray` so the screen
 * can rain; totals and leaderboard come from a fresh snapshot shortly after each burst of events.
 */
export function useNairaParty(partyId: string, onSpray?: (name: string, amountKobo: number, leftover: boolean) => void) {
  const [party, setParty] = useState<PartyView | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "offline" | "missing">("loading");
  const cb = useRef(onSpray);
  cb.current = onSpray;

  useEffect(() => {
    let refreshTimer: number | undefined;
    let closed = false;
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => api.party(partyId).then((p) => !closed && setParty(p)).catch(() => {}), 400);
    };
    const source = new EventSource(api.eventsUrl(partyId));
    source.addEventListener("snapshot", (e) => { setParty(JSON.parse((e as MessageEvent).data)); setStatus("live"); });
    source.addEventListener("spray", (e) => {
      const ev: LiveEvent = JSON.parse((e as MessageEvent).data);
      cb.current?.(ev.name ?? "Someone", ev.amountKobo ?? 0, Boolean(ev.leftover));
      // Update the total instantly, then reconcile with the server.
      setParty((p) => p && { ...p, totals: { ...p.totals, sprayedKobo: p.totals.sprayedKobo + (ev.amountKobo ?? 0), sprays: p.totals.sprays + 1 } });
      refresh();
    });
    source.addEventListener("closed", () => refresh());
    source.onerror = () => {
      setStatus((s) => (s === "loading" ? "loading" : "offline"));
      // EventSource reconnects on its own; check whether the party exists at all.
      api.party(partyId).then((p) => { setParty(p); }).catch((err) => { if (err.status === 404) { setStatus("missing"); source.close(); } });
    };
    source.onopen = () => setStatus("live");
    return () => { closed = true; clearTimeout(refreshTimer); source.close(); };
  }, [partyId]);

  return { party, status };
}
