import { loadSprayConfig } from "./config";
import { createDb, migrate } from "./db";

const db = createDb(loadSprayConfig().databaseUrl);
await migrate(db);
await db.end();
console.log("Spray database is up to date.");
