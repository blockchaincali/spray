import type { Session } from "./session";

/** Links shown in the BLAZE banner. */
export const PROJECT = {
  presentationUrl: "https://docs.google.com/presentation/d/REPLACE_WITH_WIDGET_FACTORY_DECK",
  repoUrl: "https://github.com/blockchaincali/spray",
  // CashTokens-aware address that receives EMBER2026 community votes.
  donationAddress: "bitcoincash:zqjc40pdyklz6hwf8zvf97zceqz6w6h8m5t58sw506",
};

/** Spray's revenue: a 1% platform fee, added as its own output when it clears the dust limit. */
export const TREASURY = "bitcoincash:qqjc40pdyklz6hwf8zvf97zceqz6w6h8m5v75wqjsf";
export const FEE_BPS = 100;

/** A standing party anyone (including the judges) can spray at. */
export const DEMO_SESSION: Session = {
  id: "blaze26",
  title: "BLAZE 2026 Demo Party",
  celebrant: "Caleb",
  address: "bitcoincash:qqjc40pdyklz6hwf8zvf97zceqz6w6h8m5v75wqjsf",
  currency: "USD",
};

export const EXPLORER_TX = "https://blockchair.com/bitcoin-cash/transaction/";
