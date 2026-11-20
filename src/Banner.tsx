import { useState } from "react";
import { PROJECT } from "./config";

/** The BLAZE 2026 top-of-page banner required for judging. */
export function Banner() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(PROJECT.donationAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="banner">
      <span className="banner-tag">🔥 BCH BLAZE 2026</span>
      <a href={PROJECT.presentationUrl} target="_blank" rel="noreferrer">Presentation</a>
      <a href={PROJECT.repoUrl} target="_blank" rel="noreferrer">Source code</a>
      <button className="banner-vote" onClick={copy} title={PROJECT.donationAddress}>
        {copied ? "Copied!" : "Vote with EMBER2026:"} <code>{PROJECT.donationAddress.replace("bitcoincash:", "").slice(0, 10)}…{PROJECT.donationAddress.slice(-6)}</code>
      </button>
      <span className="banner-new">New project, built from scratch during BLAZE (no pre-existing code)</span>
    </div>
  );
}
