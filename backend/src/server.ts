import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createApp } from "./app.js";

const cfg = loadConfig();
const { db, pool } = createDb(cfg);
const server = serve({ fetch: createApp(cfg, db).fetch, port: cfg.PORT }, (i) => console.log(`jazl-api :${i.port}`));
// Cloud Run тоқтатқанда қосылымдарды ұқыпты жабу
process.on("SIGTERM", () => { server.close(); void pool.end(); });
