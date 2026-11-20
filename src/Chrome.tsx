import { useEffect, useState } from "react";
import { DEMO_SESSION, PROJECT } from "./config";
import { guestUrl, screenUrl } from "./session";

const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "uses", label: "Use cases" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
];

/** Scroll to a home-page section, navigating home first if needed (hash routing owns #). */
export function goToSection(id: string) {
  const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (location.hash === "" || location.hash === "#/") scroll();
  else {
    location.hash = "#/";
    setTimeout(scroll, 80);
  }
}

/** Spray's mark: notes falling into a gold tile. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#f4b41a" />
      <rect x="7" y="8" width="14" height="8" rx="2" transform="rotate(-18 14 12)" fill="#170a26" />
      <rect x="19" y="15" width="14" height="8" rx="2" transform="rotate(14 26 19)" fill="#170a26" opacity=".8" />
      <rect x="10" y="24" width="14" height="8" rx="2" transform="rotate(-8 17 28)" fill="#170a26" opacity=".6" />
    </svg>
  );
}

export function Logo() {
  return (
    <a className="logo" href="#/" aria-label="Spray home">
      <LogoMark />
      Spray
    </a>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    const close = () => setOpen(false);
    addEventListener("hashchange", close);
    return () => removeEventListener("hashchange", close);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    goToSection(id);
  };

  return (
    <header className={`nav-wrap ${open ? "open" : ""}`}>
      <nav className="nav" aria-label="Main">
        <Logo />
        <div className="nav-links">
          {SECTIONS.map((s) => (
            <button key={s.id} className="nav-link" onClick={() => go(s.id)}>{s.label}</button>
          ))}
        </div>
        <div className="nav-cta">
          <a className="btn ghost small hide-sm" href={screenUrl(DEMO_SESSION)} target="_blank" rel="noreferrer">Live demo</a>
          <a className="btn primary small" href="#/new">Start a party</a>
          <button className="burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
        </div>
      </nav>
      <div className="drawer" hidden={!open}>
        {SECTIONS.map((s) => (
          <button key={s.id} className="drawer-link" onClick={() => go(s.id)}>{s.label}</button>
        ))}
        <a className="drawer-link" href={screenUrl(DEMO_SESSION)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>Open the demo big screen ↗</a>
        <a className="btn primary big" href={guestUrl(DEMO_SESSION)} onClick={() => setOpen(false)}>Spray at the demo party</a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>Make it rain on anyone, anywhere, in seconds. Real money, straight to their wallet, on Bitcoin Cash.</p>
        </div>
        <div className="footer-col">
          <h4>Product</h4>
          <a href="#/new">Start a party</a>
          <a href={guestUrl(DEMO_SESSION)}>Spray at the demo</a>
          <a href={screenUrl(DEMO_SESSION)} target="_blank" rel="noreferrer">Demo big screen</a>
          <button onClick={() => goToSection("uses")}>For streamers</button>
        </div>
        <div className="footer-col">
          <h4>BCH BLAZE 2026</h4>
          <a href={PROJECT.presentationUrl} target="_blank" rel="noreferrer">Presentation</a>
          <a href={PROJECT.repoUrl} target="_blank" rel="noreferrer">Source code</a>
          <button onClick={() => goToSection("faq")}>FAQ</button>
        </div>
        <div className="footer-col">
          <h4>Builder</h4>
          <a href="https://x.com/0xgeneralll" target="_blank" rel="noreferrer">X · @0xgeneralll</a>
          <a href="https://github.com/blockchaincali" target="_blank" rel="noreferrer">GitHub · blockchaincali</a>
          <span>Built in Lagos, for everywhere</span>
        </div>
      </div>
      <div className="footer-base">
        <span>© 2026 Spray · Built by Chisom Caleb Ogueji</span>
        <span>Non-custodial · BCH mainnet · No sign-up</span>
      </div>
    </footer>
  );
}
