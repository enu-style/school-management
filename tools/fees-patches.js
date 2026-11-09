const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function edit(file, steps) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.log("MISSING FILE  ", file);
    return;
  }
  let text = fs.readFileSync(full, "utf8");
  for (const [label, done, fn] of steps) {
    if (done.test(text)) {
      console.log("already done  ", label);
      continue;
    }
    const next = fn(text);
    if (next === text) {
      console.log("NOT FOUND     ", label);
      continue;
    }
    text = next;
    console.log("OK            ", label);
  }
  fs.writeFileSync(full, text);
}

const afterLine = (re, add) => (t) => t.replace(re, (m) => m + add);

edit("backend/src/server.js", [
  [
    "require lines",
    /feeRoutes/,
    afterLine(
      /const\s+yearRoutes\s*=\s*require\(['"]\.\/routes\/years['"]\);?/,
      "\nconst feeRoutes = require('./routes/fees');\nconst parentFeeRoutes = require('./routes/parentFees');\nconst userRoutes = require('./routes/users');",
    ),
  ],
  [
    "route mounting",
    /app\.use\(['"]\/api\/fees['"]/,
    afterLine(
      /app\.use\(['"]\/api\/years['"],\s*yearRoutes\);?/,
      "\napp.use('/api/fees', feeRoutes);\napp.use('/api/parent-fees', parentFeeRoutes);\napp.use('/api/users', userRoutes);",
    ),
  ],
  [
    "accountant validation",
    /app\.post\(['"]\/api\/users['"]/,
    afterLine(
      /app\.post\(['"]\/api\/teachers['"],\s*validateNewUser\);?/,
      "\napp.post('/api/users', validateNewUser);",
    ),
  ],
]);

edit("backend/src/routes/students.js", [
  [
    "student with invoices cannot be deleted",
    /financial records/,
    (t) =>
      t.replace(
        /(router\.delete\([\s\S]*?catch\s*\(err\)\s*\{\s*console\.error\(err\)[;\s]*)/,
        (m) =>
          m +
          "if (err.code === '23503') return res.status(400).json({ error: 'This student has financial records and cannot be deleted.' })\n    ",
      ),
  ],
]);
