const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const root = path.join(__dirname, "..");
const backend = path.join(root, "backend");
const need = createRequire(path.join(backend, "package.json"));
need("dotenv").config({ path: path.join(backend, ".env"), quiet: true });
const { Client } = need("pg");

const TEMP = "school_management_schema_check";
const live = process.env.DB_NAME;

async function connect(database) {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  });
  await c.connect();
  return c;
}

async function describeDb(database) {
  const c = await connect(database);
  try {
    const items = new Set();
    const add = (rows, f) => rows.forEach((r) => items.add(f(r)));
    const run = async (sql) => (await c.query(sql)).rows;

    add(
      await run(
        "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public'",
      ),
      (r) =>
        `column     ${r.table_name}.${r.column_name} (${r.data_type}, nullable ${r.is_nullable})`,
    );
    add(
      await run("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"),
      (r) => `index      ${r.indexname}`,
    );
    add(
      await run(
        "SELECT DISTINCT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public'",
      ),
      (r) => `trigger    ${r.event_object_table}.${r.trigger_name}`,
    );
    add(
      await run(
        "SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'",
      ),
      (r) => `constraint ${r.conname}`,
    );
    add(
      await run(
        "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'",
      ),
      (r) => `function   ${r.proname}`,
    );
    add(
      await run(
        "SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'",
      ),
      (r) => `sequence   ${r.sequence_name}`,
    );
    add(
      await run(
        "SELECT table_name FROM information_schema.views WHERE table_schema = 'public'",
      ),
      (r) => `view       ${r.table_name}`,
    );

    const counts = {};
    for (const t of ["classes", "exams", "fee_types", "school_settings"]) {
      try {
        counts[t] = Number(
          (await c.query(`SELECT COUNT(*) FROM ${t}`)).rows[0].count,
        );
      } catch {
        counts[t] = "missing";
      }
    }
    return { items, counts };
  } finally {
    await c.end();
  }
}

async function main() {
  const file = path.join(root, "database", "schema.sql");
  if (!fs.existsSync(file)) {
    console.log("database/schema.sql was not found.");
    process.exit(1);
  }
  if (!live || live.endsWith("_test") || live === TEMP) {
    console.log("DB_NAME in backend/.env must be your normal local database.");
    process.exit(1);
  }

  const original = fs.readFileSync(file, "utf8");
  // psql meta-commands (lines starting with a backslash) are not SQL. Blank them but keep the line numbers.
  const sql = original
    .split(/\r?\n/)
    .map((l) => (l.startsWith("\\") ? "" : l))
    .join("\n");
  const warnings = [];
  if (/OWNER TO/i.test(sql))
    warnings.push(
      'schema.sql contains "OWNER TO" lines. On a hosted database the owner name is different, so delete those lines before deploying.',
    );
  if (/set_config\(\s*'search_path'\s*,\s*''/i.test(sql))
    warnings.push(
      'schema.sql empties the search_path. SQL added after that point must say public. before table names, or add the line "SET search_path TO public;" before it.',
    );

  const admin = await connect("postgres");
  let failed = false;
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${TEMP}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${TEMP}"`);

    const t = await connect(TEMP);
    let built = false;
    try {
      await t.query(sql);
      built = true;
    } catch (err) {
      failed = true;
      console.log("\nschema.sql FAILED on an empty database:");
      console.log("  " + err.message);
      if (err.position) {
        const line = sql.slice(0, Number(err.position)).split("\n").length;
        console.log(
          `  near line ${line} (approximate): ${sql.split("\n")[line - 1].trim().slice(0, 100)}`,
        );
      }
    } finally {
      await t.end();
    }

    if (built) {
      const [a, b] = await Promise.all([describeDb(live), describeDb(TEMP)]);
      const missing = [...a.items].filter((x) => !b.items.has(x)).sort();
      const extra = [...b.items].filter((x) => !a.items.has(x)).sort();
      console.log(`\nschema.sql ran without errors. Compared with "${live}":`);
      console.log(
        `  in your database but NOT built by schema.sql: ${missing.length}`,
      );
      missing.forEach((x) => console.log("    " + x));
      console.log(
        `  built by schema.sql but not in your database: ${extra.length}`,
      );
      extra.forEach((x) => console.log("    " + x));
      console.log(
        "  seed rows after a rebuild:",
        JSON.stringify(b.counts),
        " | your database:",
        JSON.stringify(a.counts),
      );
      if (missing.length) failed = true;
    }
  } finally {
    await admin
      .query(`DROP DATABASE IF EXISTS "${TEMP}" WITH (FORCE)`)
      .catch(() => {});
    await admin.end();
  }

  warnings.forEach((w) => console.log("\nWARNING: " + w));
  console.log(
    failed
      ? "\nResult: NOT READY. Fix schema.sql, then run this again."
      : "\nResult: schema.sql rebuilds your database.",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
