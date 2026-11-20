// Builds and signs spray transactions through WizardConnect.
// UTXO scanning and the signTransaction call follow kireev-duty/bch-split (MIT).
import { binToHex, encodeCashAddress, encodeTransaction, hash160, hash256, hexToBin } from "@bitauth/libauth";
import type { DappConnectionManager } from "@wizardconnect/dapp";
import { FEE_BPS, TREASURY } from "./config";
import { getHistory, listUnspent, lockingBytecode, memoBytecode, type Utxo } from "./chain";

interface TxInput {
  outpointTransactionHash: Uint8Array;
  outpointIndex: number;
  unlockingBytecode: Uint8Array;
  sequenceNumber: number;
}

interface TxOutput {
  valueSatoshis: bigint;
  lockingBytecode: Uint8Array;
}

const RECEIVE = 0;
const CHANGE = 1;
const SCAN_DEPTH = 10;
export const DUST = 546;
const FEE_PER_BYTE = 1.1;

type PathName = "receive" | "change";
interface WalletAddress {
  path: PathName;
  index: number;
  address: string;
}
interface Coin extends WalletAddress {
  utxo: Utxo;
}

function addressAt(manager: DappConnectionManager, child: number, index: number) {
  const pubkey = manager.getPubkey(child, BigInt(index));
  if (!pubkey) return null;
  return encodeCashAddress({ prefix: "bitcoincash", type: "p2pkh", payload: hash160(pubkey) }).address;
}

export const primaryAddress = (manager: DappConnectionManager) => addressAt(manager, RECEIVE, 0);

function walletAddresses(manager: DappConnectionManager): WalletAddress[] {
  const out: WalletAddress[] = [];
  for (const [child, path] of [[RECEIVE, "receive"], [CHANGE, "change"]] as const) {
    for (let index = 0; index < SCAN_DEPTH; index++) {
      const address = addressAt(manager, child, index);
      if (address) out.push({ path, index, address });
    }
  }
  return out;
}

async function scanWallet(manager: DappConnectionManager) {
  const addresses = walletAddresses(manager);
  if (!addresses.length) throw new Error("Your wallet did not share any public keys");
  const [utxoSets, histories] = await Promise.all([
    Promise.all(addresses.map((a) => listUnspent(a.address))),
    Promise.all(addresses.map((a) => getHistory(a.address))),
  ]);
  const coins: Coin[] = addresses.flatMap((a, i) =>
    utxoSets[i].filter((u) => !u.token_data).map((utxo) => ({ ...a, utxo })),
  );
  const change =
    addresses.find((a, i) => a.path === "change" && histories[i].length === 0) ??
    addresses.find((a) => a.path === "receive")!;
  return { coins, change };
}

export async function walletBalance(manager: DappConnectionManager) {
  const { coins } = await scanWallet(manager);
  return coins.reduce((sum, c) => sum + c.utxo.value, 0);
}

const estimateSize = (inputs: number, outputs: number, memoLength: number) =>
  10 + inputs * 148 + outputs * 34 + memoLength + 9;

/** The 1% platform fee, skipped when it would be below the dust limit. */
export const platformFee = (sats: number) => {
  const fee = Math.floor((sats * FEE_BPS) / 10_000);
  return fee >= DUST ? fee : 0;
};

export async function spray(
  manager: DappConnectionManager,
  options: { to: string; sats: number; sessionId: string; name: string; amount: number; currency: string; prompt: string },
) {
  if (options.sats < DUST) throw new Error("That amount is too small to send on-chain");
  const { coins, change } = await scanWallet(manager);
  const memo = memoBytecode(options.sessionId, options.name, options.amount, options.currency);
  const fee = platformFee(options.sats);

  const selected: Coin[] = [];
  let inputTotal = 0;
  let minerFee = 0;
  const need = () => options.sats + fee + minerFee;
  for (const coin of [...coins].sort((a, b) => b.utxo.value - a.utxo.value)) {
    selected.push(coin);
    inputTotal += coin.utxo.value;
    minerFee = Math.ceil(estimateSize(selected.length, fee ? 4 : 3, memo.length) * FEE_PER_BYTE);
    if (inputTotal >= need()) break;
  }
  if (inputTotal < need()) {
    throw new Error(
      `Not enough BCH in this wallet: this spray needs ${need().toLocaleString()} sats, you have ${inputTotal.toLocaleString()}.`,
    );
  }

  const outputs: TxOutput[] = [
    { valueSatoshis: BigInt(options.sats), lockingBytecode: lockingBytecode(options.to) },
    { valueSatoshis: 0n, lockingBytecode: memo },
  ];
  if (fee) outputs.push({ valueSatoshis: BigInt(fee), lockingBytecode: lockingBytecode(TREASURY) });
  const changeValue = inputTotal - need();
  if (changeValue >= DUST) {
    outputs.push({ valueSatoshis: BigInt(changeValue), lockingBytecode: lockingBytecode(change.address) });
  }

  const inputs: TxInput[] = selected.map((c) => ({
    outpointTransactionHash: hexToBin(c.utxo.tx_hash),
    outpointIndex: c.utxo.tx_pos,
    unlockingBytecode: new Uint8Array(),
    sequenceNumber: 0xffffffff,
  }));
  // The relay carries plain JSON, so source outputs travel hex/bigint-encoded.
  const sourceOutputs = selected.map((c, i) => ({
    outpointTransactionHash: binToHex(inputs[i].outpointTransactionHash),
    outpointIndex: inputs[i].outpointIndex,
    unlockingBytecode: "",
    sequenceNumber: inputs[i].sequenceNumber,
    valueSatoshis: `<bigint: ${c.utxo.value}n>`,
    lockingBytecode: binToHex(lockingBytecode(c.address)),
  }));

  const response = await manager.signTransaction({
    transaction: {
      transaction: binToHex(encodeTransaction({ version: 2, locktime: 0, inputs, outputs })),
      sourceOutputs: sourceOutputs as any,
      broadcast: true,
      userPrompt: options.prompt,
    },
    inputPaths: selected.map((c, i) => [i, c.path, c.index] as [number, string, number]),
  });
  if (response.error) throw new Error(response.error);
  return { txid: binToHex(hash256(hexToBin(response.signedTransaction)).reverse()) };
}
