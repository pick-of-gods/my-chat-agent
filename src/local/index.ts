// src/local/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import fs from "fs";
import path from "path";

const app = new Hono();

// Resource folder for local-heavy tools
const RESOURCE_DIR = path.resolve("./resources");

app.get("/", (c) => c.text("🧩 Local Bridge Active"));

app.post("/exec", async (c) => {
  const { tool, params } = await c.req.json();

  switch (tool) {
    case "pixelDetect":
      return c.json({ result: "Pixel detection simulated.", params });
    case "mapSonar":
      return c.json({ result: "Sonar mapping complete.", params });
    case "rs3Observer":
      return c.json({ result: "RS3 observer mode activated.", params });
    default:
      return c.json({ error: "Unknown tool" }, 400);
  }
});

// File sync check (local <-> KV or D1)
app.get("/sync", async (c) => {
  const files = fs.readdirSync(RESOURCE_DIR);
  return c.json({ files });
});

serve({ fetch: app.fetch, port: 8788 });
console.log("🧠 Local AI Bridge running on http://127.0.0.1:8788");
