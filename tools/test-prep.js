const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "backend", "src");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const write = (f, t) => fs.writeFileSync(path.join(dir, f), t);

// ---------- 1. Split server.js into app.js and server.js ----------
if (fs.existsSync(path.join(dir, "app.js"))) {
  console.log("already done   app.js exists");
} else {
  let t = read("server.js");
  const jwtCheck =
    /if\s*\(\s*!process\.env\.JWT_SECRET[\s\S]*?process\.exit\(1\);?\s*\}\s*/;
  const listenAt = t.search(/const\s+PORT\s*=/);

  if (
    !jwtCheck.test(t) ||
    listenAt === -1 ||
    !/app\.listen/.test(t.slice(listenAt))
  ) {
    console.log(
      "NOT FOUND      server.js does not look as expected. Nothing was changed. Send me its last 30 lines.",
    );
    process.exit(1);
  }

  fs.copyFileSync(
    path.join(dir, "server.js"),
    path.join(__dirname, "server.js.backup"),
  );

  t = t.replace(jwtCheck, "");
  t = t.replace(/\/\/ Refuse to start[^\n]*\n/, "");
  t = t.slice(0, t.search(/const\s+PORT\s*=/));

  const swaps = [
    [
      "API limit",
      /limit:\s*300,/,
      "limit: Number(process.env.API_LIMIT) || 300,",
    ],
    [
      "login limit",
      /limit:\s*5,/,
      "limit: Number(process.env.LOGIN_LIMIT) || 5,",
    ],
    [
      "error handler",
      /app\.use\(\(err,\s*req,\s*res,\s*next\)\s*=>\s*\{[\s\S]*?\n\}\);/,
      `app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});`,
    ],
  ];
  for (const [label, re, replacement] of swaps) {
    if (re.test(t)) {
      t = t.replace(re, () => replacement);
      console.log("OK             app.js:", label);
    } else {
      console.log("NOT FOUND      app.js:", label);
    }
  }

  write("app.js", t.trimEnd() + "\n\nmodule.exports = app;\n");
  write(
    "server.js",
    `require('dotenv').config();

// Refuse to start with a missing or weak JWT secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or too short (use at least 16 characters). Check your .env file.');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
  );
  console.log("OK             created app.js and a new server.js");
}

// ---------- 2. Students in a request must belong to the class ----------
const MESSAGE = "Some students are not in this class";
const check = (ind, list) =>
  [
    `const ids = ${list}.map((r) => r.student_id)`,
    "if (ids.some((v) => !/^\\d+$/.test(String(v)))) {",
    "  return res.status(400).json({ error: 'Invalid student in the list' })",
    "}",
    "const own = await pool.query(",
    "  'SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1::int AND id = ANY($2::int[])',",
    "  [class_id, ids]",
    ")",
    "if (own.rows[0].n !== new Set(ids.map(String)).size) {",
    `  return res.status(400).json({ error: '${MESSAGE}' })`,
    "}",
  ]
    .map((line) => ind + line)
    .join("\n");

for (const [file, list] of [
  ["routes/attendance.js", "records"],
  ["routes/grades.js", "valid"],
]) {
  const text = read(file);
  if (text.includes(MESSAGE)) {
    console.log("already done  ", file);
    continue;
  }
  const begin = /\n([ \t]*)await client\.query\(['"]BEGIN['"]\);?/;
  if (!begin.test(text)) {
    console.log("NOT FOUND     ", file, "(the BEGIN line)");
    continue;
  }
  write(
    file,
    text.replace(begin, (m, ind) => "\n" + check(ind, list) + m),
  );
  console.log("OK            ", file);
}
