# Spray: make it rain, on-chain

**Live app:** https://spray-bch.vercel.app · **Built for BCH BLAZE 2026** · [Presentation (Widget Factory)](docs/Spray-BLAZE-2026.pdf) · [Demo video](https://youtu.be/Q8o2ff9NwbA)

**Spray lets a whole crowd shower someone with money, live.** Guests scan one QR code, tap an amount in the party's currency, and notes rain across the big screen while the money lands in the celebrant's Bitcoin Cash wallet within seconds.

People have always showered the ones they celebrate: the money dance at a wedding, coins in a busker's case, tips on a live stream. Spray takes that moment on-chain, in eight currencies (NGN, USD, EUR, GBP, KES, GHS, ZAR, CAD).

**Spotlight, Nigeria:** spraying cash at parties is now a crime there. Section 21 of the CBN Act makes spraying naira notes punishable by at least six months in prison or a ₦50,000 fine, and the EFCC has prosecuted it at weddings since 2024. Spray keeps the tradition and takes the cash off the floor.

## Try it in one minute (judges)

1. Open the app and click **Open the big screen** (the demo party) on your laptop.
2. On your phone, click **Spray at the demo party** (or scan the QR on the big screen).
3. Type your name, tap **$0.10**, connect a WizardConnect wallet (Paytaca, Cashonize or Selene) and approve.
4. Watch the notes rain on the big screen with your name, and your spray appear on the leaderboard.

Every spray is a real BCH mainnet transaction; the network fee is a fraction of a cent.

## Features

- **Any currency:** parties can be priced in NGN, USD, EUR, GBP, KES, GHS, ZAR or CAD; guests pay in BCH at the live rate.
- **Host setup:** celebrant name + BCH address (or "Use my wallet" via WizardConnect) → a party link. No sign-up, no server, no database: the party lives in the URL.
- **Guest spray page (mobile):** one-tap amounts in the party's currency, priced live in BCH; WizardConnect pairing persists, so repeat sprays are one tap + approve.
- **Big screen:** QR to spray, live naira total, falling notes, name shout-outs, top-sprayers leaderboard, live feed with explorer links, optional sound.
- **Stream overlay:** transparent page for OBS so streamers' viewers can spray them live.

## How it works on-chain

Each spray is one transaction built in the browser and signed in the guest's wallet over WizardConnect:

| Output | Purpose |
|---|---|
| celebrant address | the spray itself |
| `OP_RETURN "spray" <partyId> <name> <amount> <currency>` | who sprayed, at which party, how much |
| Spray treasury (1%) | platform fee, only when it clears the 546-sat dust limit |
| change | back to the guest's wallet |

The big screen subscribes to the celebrant's address through Electrum (Fulcrum) servers and reads the memos straight from the blockchain, including 0-conf transactions, so a spray shows up within seconds. Spray never holds anyone's money.

## Business model

- 1% platform fee on sprays (built into the transaction).
- Paid tiers for event planners and venues: branded screens, custom note designs, multi-screen events, post-event reports.
- Streamer tier: overlay themes and alerts.

## Tech

React + Vite + TypeScript static app · `@wizardconnect/react` / `@wizardconnect/dapp` for wallet pairing and signing · `@bitauth/libauth` for transaction encoding · `@electrum-cash/network` for chain data · CoinGecko (fallback Coinbase) for the BCH/NGN price.

Transaction building and Electrum access follow the patterns of [kireev-duty/bch-split](https://github.com/kireev-duty/bch-split) (MIT).

```bash
npm install
npm run dev     # local
npm run build   # static build in dist/
```

## BLAZE notes

New project, started and built during the BLAZE 2026 hacking window. No pre-existing code.

Community Choice votes (EMBER2026): `bitcoincash:zqjc40pdyklz6hwf8zvf97zceqz6w6h8m5t58sw506`

Built by Chisom Caleb Ogueji (blockchaincali), Lagos.
