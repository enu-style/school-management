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

// Insert text after the first match, adding a comma when the match is a list item
const after = (re, add) => (t) =>
  t.replace(re, (m) => m.replace(/,?\s*$/, ",") + add);
const afterLine = (re, add) => (t) => t.replace(re, (m) => m + add);

edit("backend/src/server.js", [
  [
    "require lines",
    /guardianRoutes/,
    afterLine(
      /const\s+yearRoutes\s*=\s*require\(['"]\.\/routes\/years['"]\);?/,
      "\nconst guardianRoutes = require('./routes/guardians');\nconst parentRoutes = require('./routes/parent');",
    ),
  ],
  [
    "route mounting",
    /app\.use\(['"]\/api\/guardians['"]/,
    afterLine(
      /app\.use\(['"]\/api\/years['"],\s*yearRoutes\);?/,
      "\napp.use('/api/guardians', guardianRoutes);\napp.use('/api/parent', parentRoutes);",
    ),
  ],
  [
    "guardian validation",
    /app\.post\(['"]\/api\/guardians['"]/,
    afterLine(
      /app\.post\(['"]\/api\/teachers['"],\s*validateNewUser\);?/,
      "\napp.post('/api/guardians', validateNewUser);",
    ),
  ],
]);

edit("backend/src/routes/card.js", [
  [
    "export buildCard",
    /module\.exports\.buildCard/,
    (t) =>
      t.replace(
        /module\.exports\s*=\s*router;?\s*$/,
        "module.exports = router\nmodule.exports.buildCard = buildCard\n",
      ),
  ],
]);

edit("backend/src/routes/password.js", [
  [
    "reset for parents",
    /guardian\s*:/,
    (t) =>
      t.replace(
        /\{\s*student:\s*['"]students['"]\s*,\s*teacher:\s*['"]teachers['"]\s*\}/,
        "{ student: 'students', teacher: 'teachers', guardian: 'guardians' }",
      ),
  ],
]);

edit("frontend/src/components/Layout.jsx", [
  [
    "parent can see shared items",
    /const\s+ALL\s*=\s*\[[^\]]*parent/,
    (t) =>
      t.replace(
        /const\s+ALL\s*=\s*\[[^\]]*\]/,
        "const ALL = ['admin', 'teacher', 'student', 'parent']",
      ),
  ],
  [
    "admin: Parents item",
    /to:\s*['"]\/guardians['"]/,
    after(
      /\{\s*to:\s*['"]\/teachers['"][^}]*\},?/,
      "\n      { to: '/guardians', label: 'Parents', icon: Users, roles: ['admin'] },",
    ),
  ],
  [
    "parent menu items",
    /to:\s*['"]\/children['"]/,
    after(
      /\{\s*to:\s*['"]\/announcements['"][^}]*\},?/,
      "\n      { to: '/children', label: 'My Children', icon: GraduationCap, roles: ['parent'] }," +
        "\n      { to: '/child-results', label: 'Child Results', icon: Award, roles: ['parent'] },",
    ),
  ],
  [
    "page titles",
    /['"]\/children['"]\s*:/,
    (t) =>
      t.replace(
        /(['"]\/promotion['"]\s*:\s*\[[^\]]*\]),?/,
        (m, g) =>
          g +
          ",\n  '/guardians': ['Parents', 'Parent accounts and the children linked to them']," +
          "\n  '/children': ['My Children', 'Your children at a glance']," +
          "\n  '/child-results': ['Child Results', 'Grades and attendance of your child'],",
      ),
  ],
]);

