import { useEffect, useMemo, useRef, useState } from "react";
import { bchPrice, findSprays, watchAddress, type Spray } from "./chain";
import type { Session } from "./session";

export interface Sprayer {
  name: string;
  amount: number;
  sats: number;
  count: number;
}

/** Live state of one party: every spray, the leaderboard, and a callback for each new spray. */
export function useParty(session: Session, onNewSpray?: (s: Spray) => void) {
  const [sprays, setSprays] = useState<Spray[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "offline">("loading");
  const [price, setPrice] = useState<number | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const cb = useRef(onNewSpray);
  cb.current = onNewSpray;

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    seen.current = null;

    const refresh = async () => {
      try {
        const found = await findSprays(session.address, session.id);
        if (cancelled) return;
        if (seen.current) {
          found.filter((s) => !seen.current!.has(s.txid)).forEach((s) => cb.current?.(s));
        }
        seen.current = new Set(found.map((s) => s.txid));
        setSprays(found);
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };

    refresh();
    watchAddress(session.address, refresh)
      .then((unwatch) => (cancelled ? unwatch() : (stop = unwatch)))
      .catch(() => setStatus("offline"));
    // Safety net in case a subscription notification is missed.
    const poll = window.setInterval(refresh, 20_000);
    return () => {
      cancelled = true;
      stop?.();
      clearInterval(poll);
    };
  }, [session.address, session.id]);

  useEffect(() => {
    const load = () => bchPrice(session.currency).then(setPrice).catch(() => {});
    load();
    const t = window.setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [session.currency]);

  const leaderboard = useMemo(() => {
    const byName = new Map<string, Sprayer>();
    for (const s of sprays) {
      const key = s.name.trim().toLowerCase();
      const row = byName.get(key) ?? { name: s.name.trim(), amount: 0, sats: 0, count: 0 };
      row.amount += s.currency === session.currency ? s.amount : 0;
      row.sats += s.sats;
      row.count += 1;
      byName.set(key, row);
    }
    return [...byName.values()].sort((a, b) => b.sats - a.sats);
  }, [sprays, session.currency]);

  const totals = useMemo(
    () => ({
      amount: sprays.reduce((t, s) => t + (s.currency === session.currency ? s.amount : 0), 0),
      sats: sprays.reduce((t, s) => t + s.sats, 0),
      count: sprays.length,
    }),
    [sprays, session.currency],
  );

  const recent = useMemo(
    () => [...sprays].sort((a, b) => (a.height <= 0 ? 1e12 : a.height) - (b.height <= 0 ? 1e12 : b.height)).reverse().slice(0, 8),
    [sprays],
  );

  return { sprays, recent, leaderboard, totals, status, price };
}
