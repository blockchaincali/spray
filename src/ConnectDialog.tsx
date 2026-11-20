import { AlphanumericQRCode } from "@wizardconnect/react";
import { useState } from "react";
import type { Wallet } from "./useWallet";

/** WizardConnect pairing: scan from another device, or open the wallet app on this phone. */
export function ConnectDialog({ wallet }: { wallet: Wallet }) {
  const [copied, setCopied] = useState(false);
  if (!wallet.showQr || !wallet.uri || !wallet.qrUri) return null;
  return (
    <div className="modal-backdrop" onClick={wallet.closeQr}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Connect a wallet">
        <button className="modal-x" onClick={wallet.closeQr} aria-label="Close">×</button>
        <p className="eyebrow">WizardConnect</p>
        <h2>Connect your BCH wallet</h2>
        <a className="btn primary big" href={wallet.uri}>Open wallet app</a>
        <p className="modal-or">or scan with Paytaca, Cashonize or Selene</p>
        <div className="modal-qr">
          <AlphanumericQRCode value={wallet.qrUri} size={220} />
        </div>
        <button
          className="btn ghost"
          onClick={() => {
            navigator.clipboard?.writeText(wallet.uri!);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy connection link"}
        </button>
        <p className="hint">Spray only sees your public keys. Every spray still needs your approval in the wallet.</p>
      </div>
    </div>
  );
}
