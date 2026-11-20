// Electrum (Fulcrum) access and on-chain spray parsing.
// Connection and memo patterns adapted from kireev-duty/bch-split (MIT).
import { ElectrumClient } from "@electrum-cash/network";
import {
  binToHex,
  binToUtf8,
  cashAddressToLockingBytecode,
  decodeAuthenticationInstructions,
  encodeDataPush,
  flattenBinArray,
  hexToBin,
  utf8ToBin,
} from "@bitauth/libauth";

const SERVERS = ["bch.imaginary.cash", "electroncash.de", "fulcrum.greyh.at", "bch.loping.net"];
export const MEMO_TAG = "spray";
export const SATS_PER_BCH = 100_000_000;

let clientPromise: Promise<ElectrumClient<any>> | null = null;

async function connectFirstAvailable() {
  let lastError: unknown;
  for (const host of SERVERS) {
    try {
      const client = new ElectrumClient("spray", "1.4.1", host);
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No Electrum server reachable");
}

export function electrum() {
  clientPromise ??= connectFirstAvailable().catch((error) => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}

async function request<T>(method: string, ...params: unknown[]): Promise<T> {
  const client = await electrum();
  const result = await client.request(method, ...(params as any[]));
  if (result instanceof Error) throw result;
  return result as T;
}

export interface Utxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  token_data?: unknown;
}

export const listUnspent = (address: string) =>
  request<Utxo[]>("blockchain.address.listunspent", address);

export const getHistory = (address: string) =>
  request<{ tx_hash: string; height: number }[]>("blockchain.address.get_history", address);

interface VerboseTx {
  txid: string;
  time?: number;
  confirmations?: number;
  vout: { value: number; scriptPubKey: { hex: string } }[];
}

const txCache = new Map<string, VerboseTx>();

async function getVerboseTx(txid: string) {
  const cached = txCache.get(txid);
  if (cached) return cached;
  const tx = await request<VerboseTx>("blockchain.transaction.get", txid, true);
  txCache.set(txid, tx);
  return tx;
}

export function lockingBytecode(address: string) {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === "string") throw new Error(decoded);
  return decoded.bytecode;
}

/** OP_RETURN "spray" <sessionId> <name> <naira>: who sprayed, at which party, how much. */
export function memoBytecode(sessionId: string, name: string, ngn: number) {
  return flattenBinArray([
    Uint8Array.of(0x6a),
    encodeDataPush(utf8ToBin(MEMO_TAG)),
    encodeDataPush(utf8ToBin(sessionId)),
    encodeDataPush(utf8ToBin(name.slice(0, 40))),
    encodeDataPush(utf8ToBin(String(ngn))),
  ]);
}

function parseMemo(hex: string) {
  if (!hex.startsWith("6a")) return null;
  try {
    const pushes = decodeAuthenticationInstructions(hexToBin(hex).slice(1)).map((ins) =>
      "data" in ins ? binToUtf8(ins.data) : null,
    );
    if (pushes[0] !== MEMO_TAG || !pushes[1] || pushes[2] == null) return null;
    return { sessionId: pushes[1], name: pushes[2], ngn: Number(pushes[3]) || 0 };
  } catch {
    return null;
  }
}

export interface Spray {
  txid: string;
  name: string;
  ngn: number;
  sats: number;
  height: number;
}

/** Every spray for one party, read straight from the celebrant's address history. */
export async function findSprays(address: string, sessionId: string): Promise<Spray[]> {
  const targetHex = binToHex(lockingBytecode(address));
  const history = (await getHistory(address)).slice(-150);
  const txs = await Promise.all(history.map((h) => getVerboseTx(h.tx_hash).catch(() => null)));
  const sprays: Spray[] = [];
  txs.forEach((tx, i) => {
    if (!tx) return;
    const memo = tx.vout.map((o) => parseMemo(o.scriptPubKey.hex)).find(Boolean);
    if (!memo || memo.sessionId !== sessionId) return;
    const sats = tx.vout
      .filter((o) => o.scriptPubKey.hex === targetHex)
      .reduce((sum, o) => sum + Math.round(o.value * SATS_PER_BCH), 0);
    if (sats > 0) sprays.push({ txid: tx.txid, name: memo.name, ngn: memo.ngn, sats, height: history[i].height });
  });
  return sprays;
}

export async function watchAddress(address: string, onChange: () => void) {
  const client = await electrum();
  const handler = (data: any) => {
    if (data?.method === "blockchain.address.subscribe" && data.params?.[0] === address) onChange();
  };
  client.on("notification", handler);
  await client.subscribe("blockchain.address.subscribe", address);
  return () => {
    client.off("notification", handler);
    client.unsubscribe("blockchain.address.subscribe", address).catch(() => {});
  };
}

export interface Price {
  ngn: number;
  usd: number;
}

let priceCache: { price: Price; at: number } | null = null;

/** BCH price in naira and dollars, with a second source as fallback. */
export async function bchPrice(): Promise<Price> {
  if (priceCache && Date.now() - priceCache.at < 120_000) return priceCache.price;
  let price: Price;
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=ngn,usd");
    const j = (await r.json())["bitcoin-cash"];
    price = { ngn: Number(j.ngn), usd: Number(j.usd) };
    if (!price.ngn) throw new Error("no price");
  } catch {
    const r = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=BCH");
    const rates = (await r.json()).data.rates;
    price = { ngn: Number(rates.NGN), usd: Number(rates.USD) };
  }
  priceCache = { price, at: Date.now() };
  return price;
}

export const ngnToSats = (ngn: number, price: Price) => Math.round((ngn / price.ngn) * SATS_PER_BCH);
export const satsToBch = (sats: number) => (sats / SATS_PER_BCH).toFixed(sats < 1e6 ? 6 : 4);
export const formatNgn = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
