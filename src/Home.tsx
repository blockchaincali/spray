import { DEMO_SESSION } from "./config";
import { guestUrl, screenUrl } from "./session";

export function Home() {
  return (
    <main className="home">
      <section className="hero">
        <p className="eyebrow">Digital money spraying · on Bitcoin Cash</p>
        <h1>
          Spray the celebrant.
          <br />
          <span>Keep the naira off the floor.</span>
        </h1>
        <p className="lede">
          Guests scan one QR code, tap ₦500, and watch the money rain across the big screen. The celebrant gets every
          kobo instantly, straight to their wallet. No cash, no money collectors, no wahala with the law.
        </p>
        <div className="cta-row">
          <a className="btn primary big" href={guestUrl(DEMO_SESSION)}>Spray at the demo party</a>
          <a className="btn ghost big" href={screenUrl(DEMO_SESSION)} target="_blank" rel="noreferrer">Open the big screen</a>
        </div>
        <p className="hint">
          Judges: open the big screen on your laptop, then spray from your phone. Each spray is a real mainnet transaction
          (₦100 is a few US cents).
        </p>
      </section>

      <section className="steps">
        <div className="step">
          <span className="step-n">1</span>
          <h3>Host starts a party</h3>
          <p>Add the celebrant's name and BCH address. Spray makes a party link, with no sign-up and no server.</p>
        </div>
        <div className="step">
          <span className="step-n">2</span>
          <h3>Guests scan and spray</h3>
          <p>Any WizardConnect wallet (Paytaca, Cashonize, Selene). Tap an amount, approve, done.</p>
        </div>
        <div className="step">
          <span className="step-n">3</span>
          <h3>The screen makes it rain</h3>
          <p>Every spray rains notes on the projector, shouts the sprayer's name and climbs the leaderboard.</p>
        </div>
      </section>

      <section className="why">
        <div>
          <h2>Why now</h2>
          <p>
            Section 21 of the CBN Act makes spraying naira notes an offence, punishable by at least six months in prison
            or a ₦50,000 fine. The EFCC has been prosecuting it at weddings and parties since 2024. Spraying is too much
            fun to stop, so Spray moves it on-chain.
          </p>
        </div>
        <div>
          <h2>Why Bitcoin Cash</h2>
          <p>
            A ₦100 spray only works when the fee is a tiny fraction of a kobo and the payment shows up in seconds. Each
            spray carries an on-chain memo (who, which party, how much), so the screen and leaderboard read straight
            from the blockchain.
          </p>
        </div>
        <div>
          <h2>Also for streamers</h2>
          <p>
            Every party comes with a transparent stream overlay. Add it to OBS and viewers can spray you live while the
            notes rain over your video.
          </p>
        </div>
      </section>

      <section className="cta-final">
        <h2>Hosting an owambe, a wedding or a live stream?</h2>
        <a className="btn primary big" href="#/new">Start a spray party</a>
      </section>
    </main>
  );
}
