import { useCallback, useEffect, useRef, useState } from "react";
import { Rain, type RainHandle } from "../Rain";
import { api, ApiError, links, naira, store, type Deposit, type PartyView, type WalletView } from "./api";

const BUNDLES = [2_000, 5_000, 10_000, 20_000, 50_000];
const TAPS = [200, 500, 1_000, 2_000, 5_000];

interface Saved { walletId: string; guestToken: string }

function useCountdown(until: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return "";
  const s = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function NairaGuest({ partyId }: { partyId: string }) {
  const key = `spray:wallet:${partyId}`;
  const [party, setParty] = useState<PartyView | null>(null);
  const [saved, setSaved] = useState<Saved | null>(() => { try { return JSON.parse(store.get(key) ?? "null"); } catch { return null; } });
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [name, setName] = useState(() => store.get("spray:name") ?? "");
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [sprayed, setSprayed] = useState(0);
  const rain = useRef<RainHandle>(null);
  const countdown = useCountdown(deposit?.status === "pending" ? deposit.expiresAt : undefined);

  useEffect(() => {
    api.party(partyId).then(setParty).catch((e) => setError(e.message));
    api.health().then((h) => setSandbox(h.vfd === "sandbox")).catch(() => {});
  }, [partyId]);

  const loadWallet = useCallback(async () => {
    if (!saved) return;
    try {
      const w = await api.wallet(saved.walletId, saved.guestToken);
      setWallet(w);
      const open = w.deposits.find((d) => d.status === "pending" && new Date(d.expiresAt).getTime() > Date.now());
      setDeposit((cur) => {
        if (cur && cur.status === "pending") {
          const latest = w.deposits.find((d) => d.depositId === cur.depositId);
          if (latest) return latest;
        }
        return open ?? (cur?.status === "paid" ? cur : null);
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) { setSaved(null); store.set(key, "null"); }
    }
  }, [saved, key]);

  useEffect(() => { loadWallet(); }, [loadWallet]);
  // While a transfer is pending, check every few seconds.
  useEffect(() => {
    if (deposit?.status !== "pending") return;
    const t = setInterval(loadWallet, 3000);
    return () => clearInterval(t);
  }, [deposit?.status, loadWallet]);

  const join = async () => {
    const who = name.trim();
    if (!who) return setError("Add your name so the big screen can shout you out.");
    setBusy(true); setError(null);
    try {
      const j = await api.join(partyId, who);
      const s = { walletId: j.walletId, guestToken: j.guestToken };
      store.set(key, JSON.stringify(s)); store.set("spray:name", who);
      setSaved(s);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const startBundle = async (amount: number) => {
    if (!saved) return;
    setBusy(true); setError(null);
    try { setDeposit(await api.deposit(saved.walletId, saved.guestToken, amount * 100)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const simulate = async () => {
    if (!saved || !deposit) return;
    setBusy(true); setError(null);
    try { setDeposit(await api.simulate(saved.walletId, saved.guestToken, deposit.depositId)); await loadWallet(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const tap = async (amount: number) => {
    if (!saved || !wallet) return;
    if (wallet.balanceKobo < amount * 100) return setError("Not enough left in your bundle for that. Load more or tap a smaller amount.");
    setError(null);
    rain.current?.spray(wallet.name, amount, "NGN");
    setWallet({ ...wallet, balanceKobo: wallet.balanceKobo - amount * 100 }); // instant feedback
    try {
      const r = await api.spray(saved.walletId, saved.guestToken, amount * 100);
      setWallet((w) => w && { ...w, balanceKobo: r.balanceKobo });
      setSprayed((n) => n + amount);
    } catch (e) {
      setError((e as Error).message);
      loadWallet();
    }
  };

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500);
  };

  if (error && !party) return <main className="guest"><h1>Oops</h1><p className="err">{error}</p></main>;
  const closed = party?.status === "closed" || wallet?.partyStatus === "closed";
  const balance = wallet?.balanceKobo ?? 0;

  return (
    <main className="guest">
      <Rain ref={rain} showShouts={false} mark="" />
      <header className="guest-head">
        <p className="eyebrow">{party?.title ?? "…"}</p>
        <h1>Spray <span>{party?.celebrant ?? ""}</span></h1>
      </header>

      {closed && <p className="success">This party has ended. Thank you for spraying! 🎉</p>}

      {!closed && !saved && (
        <section className="naira-step">
          <label className="name-field">
            Your name on the big screen
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Uncle Tayo" maxLength={40} onKeyDown={(e) => e.key === "Enter" && join()} />
          </label>
          <button className="btn primary big wide" disabled={busy} onClick={join}>Continue</button>
          <p className="hint">Pay by normal bank transfer from any Nigerian bank app. No sign-up.</p>
        </section>
      )}

      {!closed && saved && wallet && (
        <>
          <div className="bundle-card">
            <span className="bundle-label">Your bundle</span>
            <span className="bundle-amount">{naira(balance)}</span>
            {sprayed > 0 && <span className="bundle-sub">You've sprayed {naira(sprayed * 100)} so far. Abeg, no stop!</span>}
          </div>

          {deposit?.status === "pending" && deposit.accountNumber && (
            <section className="transfer-card" aria-live="polite">
              <p className="transfer-title">Transfer exactly <b>{naira(deposit.amountKobo)}</b> to:</p>
              <button className="transfer-row" onClick={() => copy("acct", deposit.accountNumber!)}>
                <span><small>Account number</small><b className="acct">{deposit.accountNumber}</b></span>
                <span className="copy">{copied === "acct" ? "Copied" : "Copy"}</span>
              </button>
              <div className="transfer-row static"><span><small>Bank</small><b>{deposit.bankName}</b></span></div>
              <button className="transfer-row" onClick={() => copy("amt", String(deposit.amountKobo / 100))}>
                <span><small>Amount</small><b>{naira(deposit.amountKobo)}</b></span>
                <span className="copy">{copied === "amt" ? "Copied" : "Copy"}</span>
              </button>
              <p className="pulse">Waiting for your transfer… {countdown && <>({countdown} left)</>}</p>
              <p className="hint">Send the exact amount. Your bundle loads automatically within seconds of the transfer.</p>
              {sandbox && <button className="btn ghost wide" disabled={busy} onClick={simulate}>🧪 Simulate the transfer (sandbox)</button>}
              <button className="btn link" onClick={() => setDeposit(null)}>Choose a different amount</button>
            </section>
          )}

          {deposit?.status !== "pending" && (
            <>
              {balance > 0 && (
                <section>
                  <p className="section-label">Tap to spray</p>
                  <div className="amounts">
                    {TAPS.map((a) => (
                      <button key={a} className="amount" disabled={balance < a * 100} onClick={() => tap(a)}>
                        <span className="amount-ngn">{naira(a * 100)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <p className="section-label">{balance > 0 ? "Load more" : "Load your bundle"}</p>
                <div className="bundles">
                  {BUNDLES.map((a) => (
                    <button key={a} className="bundle-btn" disabled={busy} onClick={() => startBundle(a)}>{naira(a * 100)}</button>
                  ))}
                </div>
                <p className="hint">One bank transfer loads your bundle, then every tap sprays instantly. Whatever's left when the party ends goes to {party?.celebrant ?? "the celebrant"}.</p>
              </section>
            </>
          )}
        </>
      )}

      {error && <p className="err" role="alert">{error}</p>}

      <footer className="guest-foot">
        <a className="btn link" href={links.screen(partyId)} target="_blank" rel="noreferrer">Open the big screen</a>
      </footer>
    </main>
  );
}
