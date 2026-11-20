import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { currencyOf, formatFiat } from "./currency";

interface Note {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotate: number;
  sway: number;
  tier: number;
  tierIndex: number;
  currency: string;
}

interface Shout {
  id: number;
  name: string;
  amount: number;
  currency: string;
}

export interface RainHandle {
  spray: (name: string, amount: number, currency: string) => void;
}


let audio: AudioContext | null = null;
export function enableSound() {
  audio ??= new AudioContext();
  audio.resume();
}
function chaChing() {
  if (!audio || audio.state !== "running") return;
  const now = audio.currentTime;
  [1318, 1760, 2637].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.07);
    gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.07 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.35);
    osc.connect(gain).connect(audio!.destination);
    osc.start(now + i * 0.07);
    osc.stop(now + i * 0.07 + 0.4);
  });
}

let nextId = 1;

/** Naira-style notes that rain down the screen every time someone sprays. */
export const Rain = forwardRef<RainHandle, { showShouts?: boolean }>(function Rain({ showShouts = true }, ref) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [shouts, setShouts] = useState<Shout[]>([]);
  const timers = useRef<number[]>([]);

  const spray = useCallback((name: string, amount: number, currency: string) => {
    const c = currencyOf(currency);
    let tierIndex = 0;
    c.tiers.forEach((t, i) => { if (amount >= t) tierIndex = i; });
    const tier = c.tiers[tierIndex];
    const count = Math.min(44, 6 + tierIndex * 6);
    const batch: Note[] = Array.from({ length: count }, () => ({
      id: nextId++,
      left: Math.random() * 96,
      delay: Math.random() * 1.4,
      duration: 3.2 + Math.random() * 2.2,
      rotate: Math.random() * 720 - 360,
      sway: Math.random() * 160 - 80,
      tier,
      tierIndex,
      currency: c.code,
    }));
    setNotes((n) => [...n, ...batch].slice(-220));
    const shout = { id: nextId++, name, amount, currency };
    setShouts((s) => [...s, shout].slice(-3));
    chaChing();
    timers.current.push(
      window.setTimeout(() => setNotes((n) => n.filter((x) => !batch.includes(x))), 7200),
      window.setTimeout(() => setShouts((s) => s.filter((x) => x !== shout)), 4200),
    );
  }, []);

  useImperativeHandle(ref, () => ({ spray }), [spray]);

  return (
    <div className="rain" aria-hidden>
      {notes.map((n) => (
        <div
          key={n.id}
          className={`note t${n.tierIndex}`}
          style={
            {
              left: `${n.left}%`,
              animationDelay: `${n.delay}s`,
              animationDuration: `${n.duration}s`,
              "--rot": `${n.rotate}deg`,
              "--sway": `${n.sway}px`,
            } as React.CSSProperties
          }
        >
          <span className="note-amt">{formatFiat(n.tier, n.currency)}</span>
          <span className="note-mark">BCH</span>
        </div>
      ))}
      {showShouts && (
        <div className="shouts">
          {shouts.map((s) => (
            <div key={s.id} className="shout">
              <b>{s.name}</b> sprayed <b>{formatFiat(s.amount, s.currency)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
