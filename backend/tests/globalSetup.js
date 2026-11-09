import { createRequire } from "module";

const require = createRequire(import.meta.url);

export async function setup() {
  process.env.DOTENV_CONFIG_QUIET = "true";
  require("dotenv").config();
  const { Client } = require("pg");
  const database = "school_management_test";

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  });

  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Cannot connect to "${database}" (${err.message}). Create it with: npm run test:db`,
    );
  }
  try {
    const r = await client.query("SELECT to_regclass('public.users') AS t");
    if (!r.rows[0].t)
      throw new Error(
        `"${database}" has no tables. Create it with: npm run test:db`,
      );
  } finally {
    await client.end();
  }
}
