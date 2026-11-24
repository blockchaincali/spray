import type { VfdConfig } from "./config";

export type VfdFetch = typeof fetch;

export class VfdApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly vfdStatus: string | null,
    /** True when the outcome is unknown (timeout, network, 5xx, unparsable). */
    readonly uncertain: boolean,
  ) {
    super(message);
  }
}

interface TokenResponse { status?: string; message?: string; data?: { access_token?: string } }

export class VfdClient {
  private token: { value: string; expiresAt: number } | null = null;
  private tokenInFlight: Promise<string> | null = null;

  constructor(
    readonly config: VfdConfig,
    private readonly fetchImpl: VfdFetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async requestToken(): Promise<string> {
    const { consumerKey, consumerSecret } = this.config;
    if (!consumerKey || !consumerSecret) throw new VfdApiError("VFD credentials are not configured", null, null, false);
    let response: Response;
    try {
      response = await this.fetchImpl(this.config.urls.auth, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.config.clientPortalHeader ? { "BAAS-CLIENT-PORTAL": this.config.clientPortalHeader } : {}),
        },
        // Finite validity: a non-expiring token (-1) would be a long-lived
        // credential sitting in server memory.
        body: JSON.stringify({ consumerKey, consumerSecret, validityTime: String(this.config.tokenValidityMinutes) }),
        signal: AbortSignal.timeout(12_000),
      });
    } catch (cause) {
      throw new VfdApiError(`VFD token request failed: ${cause instanceof Error ? cause.message : "network error"}`, null, null, false);
    }
    const body = (await response.json().catch(() => ({}))) as TokenResponse;
    const accessToken = body.data?.access_token;
    if (!response.ok || body.status !== "00" || !accessToken) {
      throw new VfdApiError(`VFD token request rejected (${response.status})`, response.status, body.status ?? null, false);
    }
    // Refresh five minutes early so a request never starts with a nearly-expired token.
    this.token = { value: accessToken, expiresAt: this.now() + Math.max(1, this.config.tokenValidityMinutes - 5) * 60_000 };
    return accessToken;
  }

  private async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && this.token.expiresAt > this.now()) return this.token.value;
    this.tokenInFlight ??= this.requestToken().finally(() => { this.tokenInFlight = null; });
    return this.tokenInFlight;
  }

  /**
   * VFD sometimes refuses a stale token with HTTP 200 and a body such as
   * {"status":"99","message":"Invalid wallet token"} instead of HTTP 401. Seen in the sandbox when
   * another client (e.g. the sandbox CLI) obtained a newer token for the same keys.
   */
  static isRejectedTokenBody(body: { status?: string; message?: string } | null | undefined): boolean {
    return /invalid (wallet |access )?token|(access )?token (has )?expired|expired (access )?token/i.test(body?.message ?? "");
  }

  /**
   * Authenticated JSON call. `uncertain` errors mean VFD may have applied the
   * request; callers moving money MUST check status before retrying.
   */
  async request<T>(base: string, path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number }): Promise<T & { status?: string; message?: string }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(attempt > 0);
      let response: Response;
      try {
        response = await this.fetchImpl(`${base}${path}`, {
          method: init.method,
          headers: { "Content-Type": "application/json", AccessToken: token },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
        });
      } catch (cause) {
        throw new VfdApiError(`VFD request failed: ${cause instanceof Error ? cause.message : "network error"}`, null, null, true);
      }
      // A rejected token was refused before any processing, so one refresh+retry is safe.
      if (response.status === 401 && attempt === 0) continue;
      const body = (await response.json().catch(() => null)) as (T & { status?: string; message?: string }) | null;
      if (body == null) throw new VfdApiError(`VFD returned an unreadable response (${response.status})`, response.status, null, true);
      // Rate limited: nothing was processed. Callers that poll (status-query backup) slow down on this.
      if (response.status === 429) throw new VfdApiError("VFD rate limit reached (429)", 429, body.status ?? null, true);
      if (response.status >= 500) throw new VfdApiError(`VFD server error (${response.status})`, response.status, body.status ?? null, true);
      // Same as a 401: the token was refused before anything was processed, so refresh once and retry.
      if (VfdClient.isRejectedTokenBody(body)) {
        if (attempt === 0) continue;
        throw new VfdApiError("VFD rejected the access token", response.status, body.status ?? null, false);
      }
      return body;
    }
    throw new VfdApiError("VFD rejected the access token", 401, null, false);
  }
}
