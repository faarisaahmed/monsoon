// Creates the progress table. Run with: node --env-file=.env.local scripts/migrate.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();
await client.query(`
  CREATE TABLE IF NOT EXISTS progress (
    user_id    text PRIMARY KEY,
    data       jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  -- bumped on every save, so two devices saving at once can't overwrite each other
  ALTER TABLE progress ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
`);
console.log("progress table ready");
await client.end();
