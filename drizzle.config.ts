import type { Config } from "drizzle-kit";

// Only needed if you want `npx drizzle-kit studio` to browse the DB.
// The app itself creates tables on boot (see lib/server/db.ts).
export default {
  schema: "./lib/sync/schema.ts",
  dialect: "sqlite",
  dbCredentials: { url: "./data/woodshed.db" },
} satisfies Config;
