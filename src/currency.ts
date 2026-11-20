/** Fiat currencies a party can be priced in. Amounts are one-tap spray buttons. */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  tiers: number[];
}

export const CURRENCIES: Currency[] = [
  { code: "NGN", name: "Nigerian naira", symbol: "₦", tiers: [100, 200, 500, 1000, 2000, 5000] },
  { code: "USD", name: "US dollar", symbol: "$", tiers: [1, 2, 5, 10, 20, 50] },
  { code: "EUR", name: "Euro", symbol: "€", tiers: [1, 2, 5, 10, 20, 50] },
  { code: "GBP", name: "British pound", symbol: "£", tiers: [1, 2, 5, 10, 20, 50] },
  { code: "KES", name: "Kenyan shilling", symbol: "KSh", tiers: [50, 100, 200, 500, 1000, 2000] },
  { code: "GHS", name: "Ghanaian cedi", symbol: "GH₵", tiers: [5, 10, 20, 50, 100, 200] },
  { code: "ZAR", name: "South African rand", symbol: "R", tiers: [10, 20, 50, 100, 200, 500] },
  { code: "CAD", name: "Canadian dollar", symbol: "C$", tiers: [1, 2, 5, 10, 20, 50] },
];

export const currencyOf = (code: string | undefined) =>
  CURRENCIES.find((c) => c.code === code?.toUpperCase()) ?? CURRENCIES[0];

export function formatFiat(amount: number, code: string) {
  const c = currencyOf(code);
  const rounded = amount >= 100 || Number.isInteger(amount) ? Math.round(amount) : Math.round(amount * 100) / 100;
  return `${c.symbol}${rounded.toLocaleString("en-US")}`;
}

/** Best guess at the visitor's currency from their browser locale. */
export function guessCurrency() {
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  const byRegion: Record<string, string> = {
    NG: "NGN", US: "USD", GB: "GBP", KE: "KES", GH: "GHS", ZA: "ZAR", CA: "CAD",
    DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR", PT: "EUR", BE: "EUR",
  };
  return byRegion[region] ?? "NGN";
}
