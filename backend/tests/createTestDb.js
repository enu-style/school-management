require("dotenv").config();
const { Client } = require("pg");

const source = process.env.DB_NAME;
const target = "school_management_test";

async function main() {
  if (process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is set. This script is for your local database only.",
    );
  if (!source || source === target)
    throw new Error("DB_NAME in .env must be your normal local database.");

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "postgres",
  });
  await client.connect();
  await client.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ANY($1::text[]) AND pid <> pg_backend_pid()",
    [[source, target]],
  );
  await client.query(`DROP DATABASE IF EXISTS "${target}"`);
  await client.query(`CREATE DATABASE "${target}" TEMPLATE "${source}"`);
  await client.end();
  console.log(`Created "${target}" from "${source}".`);
}

main().catch((err) => {
  console.error("Could not create the test database:", err.message);
  process.exit(1);
});
