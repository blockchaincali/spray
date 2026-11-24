// Client for the Spray naira backend (server/). Amounts are kobo on the wire.
export const API_URL = (import.meta.env.VITE_SPRAY_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:4100";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "Can't reach Spray right now. Check your connection.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "ERROR", body.message && body.message !== body.error ? body.message : friendly(body.error));
  return body as T;
}

const MESSAGES: Record<string, string> = {
  PARTY_NOT_FOUND: "This party link doesn't exist.",
  PARTY_CLOSED: "This party has ended. Thanks for spraying!",
  NOT_YOUR_WALLET: "This bundle belongs to another device.",
  INSUFFICIENT_BALANCE: "Your bundle is empty. Load more to keep spraying.",
  RATE_LIMITED: "Easy! Too many taps. Wait a moment.",
  NOT_HOST: "Only the host can do that.",
  ACCOUNT_NOT_FOUND: "That bank account could not be found.",
};
const friendly = (code: string | undefined) => (code && MESSAGES[code]) || "Something went wrong. Please try again.";

export interface PartyView {
  id: string; title: string; celebrant: string; status: "live" | "closed"; payoutAccountName: string;
  totals: { sprayedKobo: number; sprays: number; guests: number };
  leaderboard: { name: string; amountKobo: number; sprays: number }[];
  recent: { name: string; amountKobo: number; at: string }[];
}
export interface Deposit {
  depositId: string; accountNumber: string | null; bankName: string; amountKobo: number;
  status: "pending" | "paid" | "expired" | "failed"; expiresAt: string; paidAt: string | null;
}
export interface WalletView { walletId: string; partyId: string; name: string; balanceKobo: number; loadedKobo: number; partyStatus: string; deposits: Deposit[] }
export interface PayoutView { status: string; grossKobo: number; sprayFeeKobo: number; plannerShareKobo: number; netKobo: number; accountName: string }
export interface HostSummary extends PartyView {
  planner: string | null; loadedKobo: number;
  payoutAccount: { name: string; accountNumber: string; bankCode: string };
  estimate: { grossKobo: number; sprayFeeKobo: number; plannerShareKobo: number; netKobo: number };
  payout: PayoutView | null;
}

export const api = {
  health: () => call<{ ok: boolean; vfd: "sandbox" | "live" }>("/api/health"),
  banks: () => call<{ banks: { code: string; name: string }[] }>("/api/banks"),
  createParty: (body: { title: string; celebrant: string; planner: string; bankCode: string; accountNumber: string }) =>
    call<{ partyId: string; hostToken: string; title: string; celebrant: string; payoutAccountName: string }>("/api/parties", { method: "POST", body }),
  party: (id: string) => call<PartyView>(`/api/parties/${encodeURIComponent(id)}`),
  join: (id: string, name: string) => call<{ walletId: string; guestToken: string; name: string }>(`/api/parties/${encodeURIComponent(id)}/join`, { method: "POST", body: { name } }),
  wallet: (walletId: string, token: string) => call<WalletView>(`/api/wallets/${walletId}`, { token }),
  deposit: (walletId: string, token: string, amountKobo: number) => call<Deposit>(`/api/wallets/${walletId}/deposits`, { method: "POST", token, body: { amountKobo } }),
  simulate: (walletId: string, token: string, depositId: string) => call<Deposit>(`/api/wallets/${walletId}/simulate`, { method: "POST", token, body: { depositId } }),
  spray: (walletId: string, token: string, amountKobo: number) => call<{ balanceKobo: number }>(`/api/wallets/${walletId}/spray`, { method: "POST", token, body: { amountKobo } }),
  host: (id: string, token: string) => call<HostSummary>(`/api/parties/${encodeURIComponent(id)}/host`, { token }),
  close: (id: string, token: string) => call<PayoutView>(`/api/parties/${encodeURIComponent(id)}/close`, { method: "POST", token }),
  eventsUrl: (id: string) => `${API_URL}/api/parties/${encodeURIComponent(id)}/events`,
};

export const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;

// Browser storage can be unavailable (private mode); keep tokens working for the session regardless.
const memory = new Map<string, string>();
export const store = {
  get(key: string) { try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
  set(key: string, value: string) { memory.set(key, value); try { localStorage.setItem(key, value); } catch {} },
};

const base = () => `${location.origin}${location.pathname}`;
export const links = {
  guest: (id: string) => `${base()}#/n/g/${id}`,
  screen: (id: string) => `${base()}#/n/s/${id}`,
  overlay: (id: string) => `${base()}#/n/o/${id}`,
  host: (id: string) => `${base()}#/n/h/${id}`,
};
