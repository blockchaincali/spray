import { DEMO_SESSION } from "./config";
import { guestUrl, screenUrl } from "./session";

const HERO_NOTES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 92,
  delay: (i * 0.53) % 4.2,
  dur: 4.2 + ((i * 0.7) % 2.4),
  tier: i % 6,
  label: ["₦500", "$5", "₦1,000", "£2", "₦200", "€10"][i % 6],
}));

const USES = [
  { icon: "💍", title: "Weddings & owambes", text: "Put the QR on the projector and let the aunties and uncles spray the couple without a single note on the floor." },
  { icon: "🎥", title: "Live streams", text: "Add the transparent overlay to OBS. Viewers spray you live and the notes rain over your video, with their names." },
  { icon: "🎤", title: "Gigs & DJ sets", text: "Crowds have always sprayed the performer. Now the money lands in the artist's wallet instead of a sack." },
  { icon: "🎂", title: "Birthdays & milestones", text: "Graduations, naming ceremonies, send-forths: share the link in the group chat so friends abroad can spray too." },
];

const FAQ = [
  {
    q: "Do guests need an account?",
    a: "No. Guests open the party link, connect any WizardConnect wallet (Paytaca, Cashonize or Selene) and tap an amount. Hosts don't sign up either: the party lives in the link.",
  },
  {
    q: "Does Spray hold the money?",
    a: "Never. Each spray is a Bitcoin Cash transaction from the guest's wallet straight to the celebrant's address. Spray only builds the transaction; the guest's wallet signs it.",
  },
  {
    q: "How fast does it show up?",
    a: "Seconds. The big screen listens to the blockchain and reacts as soon as the transaction is broadcast, before it is even mined into a block.",
  },
  {
    q: "What does it cost?",
    a: "The Bitcoin Cash network fee is a fraction of a cent. Spray adds a 1% platform fee as its own output on larger sprays, so every fee is visible on-chain.",
  },
  {
    q: "Which currencies can I use?",
    a: "Naira, dollars, euros, pounds, shillings, cedis, rand and Canadian dollars. Guests tap amounts in the party's currency and pay in BCH at the live rate.",
  },
];

export function Home() {
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Live money spraying · on Bitcoin Cash</p>
          <h1>
            Make it rain.
            <br />
            <span>On-chain.</span>
          </h1>
          <p className="lede">
            Spray lets a whole crowd shower someone with money in real time. Guests scan a QR code and tap an amount. The
            money lands in the celebrant's wallet in seconds, while notes rain across the big screen with every name.
          </p>
          <div className="cta-row">
            <a className="btn primary big" href={guestUrl(DEMO_SESSION)}>Spray at the demo party</a>
            <a className="btn ghost big" href={screenUrl(DEMO_SESSION)} target="_blank" rel="noreferrer">Open the big screen ↗</a>
          </div>
          <p className="hint">
            <b>Judges:</b> open the big screen on your laptop, then spray from your phone. Each spray is a real mainnet
            transaction; the smallest costs a few cents.
          </p>
          <div className="works-with">
            <span>Works with</span> Paytaca · Cashonize · Selene · OBS
          </div>
        </div>

        <div className="hero-visual" aria-hidden>
          <div className="mock-screen">
            <div className="mock-notes">
              {HERO_NOTES.map((n, i) => (
                <div
                  key={i}
                  className={`note t${n.tier} mini`}
                  style={{ left: `${n.left}%`, animationDelay: `${n.delay}s`, animationDuration: `${n.dur}s`, "--rot": `${(i % 2 ? 1 : -1) * 260}deg`, "--sway": `${(i % 3) * 30 - 30}px` } as React.CSSProperties}
                >
                  <span className="note-amt">{n.label}</span>
                </div>
              ))}
            </div>
            <p className="mock-eyebrow">Ada weds Tunde</p>
            <p className="mock-title">Spray Ada!</p>
            <p className="mock-total">₦482,500</p>
            <div className="mock-shout"><b>Uncle Tayo</b> sprayed <b>₦5,000</b></div>
            <ol className="mock-board">
              <li><span>👑</span> Uncle Tayo <b>₦85,000</b></li>
              <li><span>2</span> Chioma <b>₦62,000</b></li>
              <li><span>3</span> Femi <b>₦41,500</b></li>
            </ol>
          </div>
          <div className="mock-phone">
            <p className="mock-eyebrow">Ada weds Tunde</p>
            <p className="mock-phone-title">Spray <span>Ada</span></p>
            <div className="mock-amounts">
              {["₦200", "₦500", "₦1,000", "₦5,000"].map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
            <p className="mock-ok">You sprayed ₦1,000 🎉</p>
          </div>
        </div>
      </section>

      <section className="stats">
        <div><b>&lt; 1¢</b><span>network fee per spray</span></div>
        <div><b>Seconds</b><span>from tap to the big screen</span></div>
        <div><b>0</b><span>sign-ups, servers or custody</span></div>
        <div><b>8</b><span>currencies, priced live</span></div>
      </section>

      <section id="how" className="block">
        <p className="eyebrow">How it works</p>
        <h2 className="block-title">Three steps from QR code to money rain</h2>
        <div className="steps">
          <div className="step">
            <span className="step-n">1</span>
            <h3>Host starts a party</h3>
            <p>Name the celebrant, pick a currency and add their BCH address. Spray turns it into a party link, with nothing to install.</p>
          </div>
          <div className="step">
            <span className="step-n">2</span>
            <h3>Guests scan and spray</h3>
            <p>Scan the QR on the big screen, type a name, tap an amount and approve in the wallet. Repeat sprays are one tap.</p>
          </div>
          <div className="step">
            <span className="step-n">3</span>
            <h3>The screen makes it rain</h3>
            <p>Every spray rains notes, shouts the sprayer's name and climbs the leaderboard, all read live from the blockchain.</p>
          </div>
        </div>
      </section>

      <section id="uses" className="block">
        <p className="eyebrow">Use cases</p>
        <h2 className="block-title">Anywhere a crowd wants to show love</h2>
        <div className="uses">
          {USES.map((u) => (
            <div className="use" key={u.title}>
              <span className="use-icon">{u.icon}</span>
              <h3>{u.title}</h3>
              <p>{u.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="origin">
        <div className="origin-copy">
          <p className="eyebrow">Born at the Nigerian owambe</p>
          <h2>Spraying is a celebration. In Nigeria it's now also a crime.</h2>
          <p>
            Section 21 of the CBN Act makes spraying naira notes punishable by at least six months in prison or a ₦50,000
            fine, and the EFCC has prosecuted it at weddings and parties since 2024. The tradition isn't going anywhere,
            so Spray keeps the joy and moves the money on-chain.
          </p>
          <p>The same ritual lives on in tipping, busking and live streams around the world. Spray works for all of them.</p>
        </div>
        <div className="origin-card">
          <p className="quote">"No naira on the floor. No EFCC in the crowd. Just a QR code on the screen."</p>
          <div className="origin-facts">
            <div><b>6 months</b><span>minimum jail term for spraying naira</span></div>
            <div><b>₦50,000</b><span>minimum fine</span></div>
          </div>
        </div>
      </section>

      <section className="block why-bch">
        <p className="eyebrow">Why Bitcoin Cash</p>
        <h2 className="block-title">Built for tiny, instant, public payments</h2>
        <div className="why">
          <div>
            <h3>Fees that don't eat the gift</h3>
            <p>A small spray only makes sense when the network fee is a fraction of a cent. On BCH it is.</p>
          </div>
          <div>
            <h3>Instant on screen</h3>
            <p>The screen reacts to broadcast transactions, so the rain starts while the guest is still smiling.</p>
          </div>
          <div>
            <h3>The party is on-chain</h3>
            <p>Each spray carries a memo: who, which party, how much. The leaderboard needs no database; anyone can verify it.</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="block">
        <p className="eyebrow">Pricing</p>
        <h2 className="block-title">Free to start. Fair when it grows.</h2>
        <div className="pricing">
          <div className="price-card">
            <h3>Party</h3>
            <p className="price">1% <span>per spray</span></p>
            <ul>
              <li>Unlimited guests and sprays</li>
              <li>Big screen, leaderboard and stream overlay</li>
              <li>8 currencies, live BCH pricing</li>
              <li>Fee skipped on the smallest sprays</li>
            </ul>
            <a className="btn primary" href="#/new">Start a party</a>
          </div>
          <div className="price-card pro">
            <span className="badge">Coming soon</span>
            <h3>Pro, for planners & venues</h3>
            <p className="price">Custom</p>
            <ul>
              <li>Branded screens and custom note designs</li>
              <li>Multiple screens and MCs per event</li>
              <li>Post-event reports for the celebrants</li>
              <li>Streamer themes and alerts</li>
            </ul>
            <a className="btn ghost" href="https://x.com/0xgeneralll" target="_blank" rel="noreferrer">Get early access</a>
          </div>
        </div>
      </section>

      <section id="faq" className="block faq">
        <p className="eyebrow">FAQ</p>
        <h2 className="block-title">Questions, answered</h2>
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <section className="cta-final">
        <h2>Hosting a wedding, a party or a live stream?</h2>
        <a className="btn primary big" href="#/new">Start a spray party</a>
      </section>
    </main>
  );
}
