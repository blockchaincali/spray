import { decodeCashAddress } from "@bitauth/libauth";

/** A spray session lives entirely in the link: no server, no database. */
export interface Session {
  id: string;
  title: string;
  celebrant: string;
  address: string;
  currency: string;
}

const toB64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeSession(s: Session) {
  return toB64Url(JSON.stringify([s.id, s.title, s.celebrant, s.address.replace(/^bitcoincash:/, ""), s.currency]));
}

export function decodeSession(token: string): Session | null {
  try {
    const [id, title, celebrant, addr, currency] = JSON.parse(fromB64Url(token));
    const address = `bitcoincash:${addr}`;
    if (typeof id !== "string" || !isValidAddress(address)) return null;
    return { id, title: String(title), celebrant: String(celebrant), address, currency: typeof currency === "string" ? currency : "NGN" };
  } catch {
    return null;
  }
}

export function normalizeAddress(input: string) {
  const trimmed = input.trim();
  return trimmed.includes(":") ? trimmed : `bitcoincash:${trimmed}`;
}

export function isValidAddress(address: string) {
  const decoded = decodeCashAddress(normalizeAddress(address));
  return typeof decoded !== "string" && decoded.prefix === "bitcoincash";
}

export function newSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

const base = () => `${location.origin}${location.pathname}`;
export const guestUrl = (s: Session) => `${base()}#/g/${encodeSession(s)}`;
export const screenUrl = (s: Session) => `${base()}#/s/${encodeSession(s)}`;
export const overlayUrl = (s: Session) => `${base()}#/o/${encodeSession(s)}`;
