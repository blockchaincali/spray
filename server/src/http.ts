import http from "node:http";
import type { SprayConfig } from "./config";
import { SprayError, type SprayEvent, type SprayService } from "./service";
import { authenticateVfdWebhook, loadVfdConfig, parseInwardCredit } from "./vfd/index";

/** Server-sent events: each big screen / overlay subscribes to its party. */
export class EventHub {
  private readonly subs = new Map<string, Set<http.ServerResponse>>();
  subscribe(partyId: string, res: http.ServerResponse) {
    let set = this.subs.get(partyId);
    if (!set) this.subs.set(partyId, (set = new Set()));
    set.add(res);
    res.on("close", () => { set!.delete(res); if (!set!.size) this.subs.delete(partyId); });
  }
  publish = (event: SprayEvent) => {
    const line = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of this.subs.get(event.partyId) ?? []) res.write(line);
  };
  keepAlive() {
    for (const set of this.subs.values()) for (const res of set) res.write(": ping\n\n");
  }
}

const MAX_BODY = 16 * 1024;

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new SprayError(413, "TOO_LARGE")); req.destroy(); } else chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new SprayError(400, "BAD_JSON")); }
    });
    req.on("error", reject);
  });
}

export function createHttpServer(service: SprayService, hub: EventHub, config: SprayConfig) {
  const hits = new Map<string, number[]>();
  const limited = (key: string, max: number) => {
    const now = Date.now(), list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    list.push(now); hits.set(key, list);
    if (hits.size > 10_000) hits.clear();
    return list.length > max;
  };

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors: Record<string, string> = {};
    if (origin && config.allowedOrigins.includes(origin)) {
      Object.assign(cors, { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors });
      res.end(JSON.stringify(body));
    };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api","parties",":id","events"]
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || undefined;
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();

    try {
      if (parts[0] !== "api") return send(404, { error: "NOT_FOUND" });
      if (req.method === "POST" && limited(ip, 240)) return send(429, { error: "RATE_LIMITED" });
      const [, resource, id, action] = parts;

      if (resource === "health") return send(200, { ok: true, vfd: service.environment });
      if (resource === "banks" && req.method === "GET") return send(200, { banks: await service.banks() });

      if (resource === "parties") {
        if (!id && req.method === "POST") return send(201, await service.createParty(await readJson(req)));
        if (id && !action && req.method === "GET") return send(200, await service.party(id));
        if (id && action === "events" && req.method === "GET") {
          const snapshot = await service.party(id);
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no", ...cors });
          res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
          return hub.subscribe(id, res);
        }
        if (id && action === "join" && req.method === "POST") return send(201, await service.joinParty(id, await readJson(req)));
        if (id && action === "host" && req.method === "GET") return send(200, await service.hostSummary(id, bearer));
        if (id && action === "close" && req.method === "POST") return send(200, await service.closeParty(id, bearer));
      }

      if (resource === "wallets" && id) {
        if (!action && req.method === "GET") return send(200, await service.wallet(id, bearer));
        if (action === "deposits" && req.method === "POST") return send(201, await service.startDeposit(id, bearer, await readJson(req)));
        if (action === "spray" && req.method === "POST") {
          if (limited(`spray:${id}`, 120)) return send(429, { error: "RATE_LIMITED" });
          return send(200, await service.spray(id, bearer, await readJson(req)));
        }
        if (action === "simulate" && req.method === "POST") {
          const body = await readJson(req);
          return send(200, await service.simulateDeposit(id, bearer, String(body.depositId ?? "")));
        }
      }

      // VFD inward-credit notification: secret path token + optional portal header, then verified by status query.
      if (resource === "vfd" && id === "webhook" && action && req.method === "POST") {
        const vfd = loadVfdConfig();
        const auth = authenticateVfdWebhook({
          providedToken: action, configuredSecret: vfd.webhookSecret, allowedIps: vfd.webhookIps, sourceIp: ip,
          providedHeaderValue: req.headers[vfd.webhookAuthHeader] as string | undefined, configuredHeaderValue: vfd.webhookAuthValue,
          configuredHeaderPrefix: vfd.webhookAuthPrefix, headerRequired: vfd.webhookAuthRequired,
        });
        if (!auth.ok) return send(auth.reason === "NOT_CONFIGURED" ? 503 : 401, { error: "UNAUTHORIZED" });
        const credit = parseInwardCredit(await readJson(req));
        if (!credit) return send(200, { received: true, outcome: "ignored" });
        return send(200, { received: true, ...(await service.handleInwardCredit(credit)) });
      }

      return send(404, { error: "NOT_FOUND" });
    } catch (error) {
      if (error instanceof SprayError) return send(error.status, { error: error.code, message: error.message });
      console.error("Request failed", req.method, url.pathname, error);
      return send(500, { error: "SERVER_ERROR" });
    }
  });
}
