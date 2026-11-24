import { loadSprayConfig } from "./config";
import { createDb, migrate } from "./db";
import { createHttpServer, EventHub } from "./http";
import { SprayService } from "./service";
import { FakeVfd } from "./fake-vfd";
import { createVfdPort } from "./vfd-port";
import { loadVfdConfig, vfdCredentialsConfigured, vfdSafetyBlock } from "./vfd/index";

const config = loadSprayConfig();
const vfdConfig = loadVfdConfig();
const fakeBank = process.env.SPRAY_FAKE_BANK === "true";
if (fakeBank && process.env.NODE_ENV === "production") throw new Error("SPRAY_FAKE_BANK is for local demos only");
if (!fakeBank) {
  const blocked = vfdSafetyBlock({ ...process.env, VFD_ENABLED: "true" });
  if (blocked) throw new Error(`VFD refused to start: ${blocked}`);
  if (!vfdCredentialsConfigured(vfdConfig)) throw new Error("VFD credentials are incomplete: set VFD_CONSUMER_KEY, VFD_CONSUMER_SECRET, VFD_WALLET_NAME and VFD_COLLECTION_ACCOUNT_NUMBER (or SPRAY_FAKE_BANK=true for a local demo)");
}

const db = createDb(config.databaseUrl);
await migrate(db);
const hub = new EventHub();
const service = new SprayService(db, fakeBank ? new FakeVfd() : createVfdPort(vfdConfig), config, hub.publish);
const server = createHttpServer(service, hub, config);

server.listen(config.port, () => console.log(`Spray API on :${config.port} (${fakeBank ? "FAKE demo bank" : `VFD ${vfdConfig.environment}`})`));
setInterval(() => hub.keepAlive(), 20_000).unref();
// Status-query backup: open bundles are confirmed even if no webhook ever arrives.
setInterval(() => service.sweepPendingDeposits().catch((e) => console.warn("Deposit sweep failed:", e.message)), config.depositPollSeconds * 1000).unref();
