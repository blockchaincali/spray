import { useEffect, useRef, useState } from "react";
import { bchPrice, formatNgn, ngnToSats, satsToBch, type Price } from "./chain";
import { AMOUNTS_NGN, EXPLORER_TX } from "./config";
import { Rain, type RainHandle } from "./Rain";
import { screenUrl, type Session } from "./session";
import type { Wallet } from "./useWallet";
import { DUST, spray } from "./wallet";

type Status =
  | { kind: "idle" }
  | { kind: "connecting"; ngn: number }
  | { kind: "signing"; ngn: number }
  | { kind: "done"; ngn: number; txid: string }
  | { kind: "error"; message: string };

const NAME_KEY = "spray:name";

export function Guest({ session, wallet }: { session: Session; wallet: Wallet }) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  const [price, setPrice] = useState<Price | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [count, setCount] = useState(0);
  const rain = useRef<RainHandle>(null);

  useEffect(() => {
    bchPrice().then(setPrice).catch(() => setStatus({ kind: "error", message: "Couldn't load the BCH price. Check your connection and refresh." }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {}
  }, [name]);

  const busy = status.kind === "connecting" || status.kind === "signing";

  const doSpray = async (ngn: number) => {
    if (!price || busy) return;
    const who = name.trim();
    if (!who) {
      setStatus({ kind: "error", message: "Add your name first so the screen can shout you out." });
      return;
    }
    const sats = ngnToSats(ngn, price);
    if (sats < DUST) {
      setStatus({ kind: "error", message: "That amount is too small to send on-chain." });
      return;
    }
    setStatus({ kind: "connecting", ngn });
    const connected = await wallet.connect();
    if (!connected || !wallet.manager) {
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "signing", ngn });
    try {
      const { txid } = await spray(wallet.manager, {
        to: session.address,
        sats,
        ngn,
        name: who,
        sessionId: session.id,
        prompt: `Spray ${formatNgn(ngn)} on ${session.celebrant} at ${session.title}`,
      });
      setStatus({ kind: "done", ngn, txid });
      setCount((c) => c + 1);
      rain.current?.spray(who, ngn);
      wallet.refreshBalance();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus({ kind: "error", message: /reject|denied|cancel/i.test(message) ? "Spray cancelled in your wallet." : message });
    }
  };

  return (
    <main className="guest">
      <Rain ref={rain} showShouts={false} />
      <header className="guest-head">
        <p className="eyebrow">{session.title}</p>
        <h1>
          Spray <span>{session.celebrant}</span>
        </h1>
      </header>

      <label className="name-field">
        Your name on the big screen
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Uncle Tayo" maxLength={40} />
      </label>

      <div className="amounts">
        {AMOUNTS_NGN.map((ngn) => (
          <button key={ngn} className="amount" disabled={!price || busy} onClick={() => doSpray(ngn)}>
            <span className="amount-ngn">{formatNgn(ngn)}</span>
            <span className="amount-bch">{price ? `${satsToBch(ngnToSats(ngn, price))} BCH` : "…"}</span>
          </button>
        ))}
      </div>

      <div className="guest-status" aria-live="polite">
        {status.kind === "connecting" && <p>Connect your wallet to spray {formatNgn(status.ngn)}…</p>}
        {status.kind === "signing" && <p className="pulse">Approve the {formatNgn(status.ngn)} spray in your wallet…</p>}
        {status.kind === "done" && (
          <div className="success">
            <p className="success-big">You sprayed {formatNgn(status.ngn)} 🎉</p>
            <p>
              It's raining on the big screen now. <a href={EXPLORER_TX + status.txid} target="_blank" rel="noreferrer">See the transaction</a>
            </p>
            {count > 1 && <p className="muted">{count} sprays from you so far. Abeg, no stop!</p>}
          </div>
        )}
        {status.kind === "error" && <p className="err">{status.message}</p>}
      </div>

      <footer className="guest-foot">
        {wallet.ready ? (
          <p>
            Wallet connected{wallet.walletName ? ` (${wallet.walletName})` : ""}
            {wallet.balance != null && price && <> · balance {formatNgn((wallet.balance / 1e8) * price.ngn)}</>} ·{" "}
            <button className="btn link" onClick={() => wallet.disconnect()}>Disconnect</button>
          </p>
        ) : (
          <button className="btn ghost" onClick={() => wallet.connect()}>Connect wallet</button>
        )}
        <a className="btn link" href={screenUrl(session)} target="_blank" rel="noreferrer">Open the big screen</a>
      </footer>
    </main>
  );
}
