import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { formatNgn } from "./chain";

interface Note {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotate: number;
  sway: number;
  tier: number;
}

interface Shout {
  id: number;
  name: string;
  ngn: number;
}

export interface RainHandle {
  spray: (name: string, ngn: number) => void;
}

const TIERS = [100, 200, 500, 1000, 2000, 5000];
const tierOf = (ngn: number) => [...TIERS].reverse().find((t) => ngn >= t) ?? 100;

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

  const spray = useCallback((name: string, ngn: number) => {
    const tier = tierOf(ngn);
    const count = Math.min(44, 3 + Math.round(Math.sqrt(Math.max(ngn, 100)) / 2));
    const batch: Note[] = Array.from({ length: count }, () => ({
      id: nextId++,
      left: Math.random() * 96,
      delay: Math.random() * 1.4,
      duration: 3.2 + Math.random() * 2.2,
      rotate: Math.random() * 720 - 360,
      sway: Math.random() * 160 - 80,
      tier,
    }));
    setNotes((n) => [...n, ...batch].slice(-220));
    const shout = { id: nextId++, name, ngn };
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
          className={`note t${n.tier}`}
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
          <span className="note-amt">₦{n.tier}</span>
          <span className="note-mark">BCH</span>
        </div>
      ))}
      {showShouts && (
        <div className="shouts">
          {shouts.map((s) => (
            <div key={s.id} className="shout">
              <b>{s.name}</b> sprayed <b>{formatNgn(s.ngn)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
