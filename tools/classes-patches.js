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
const after = (re, add) => (t) =>
  t.replace(re, (m) => m.replace(/,?\s*$/, ",") + add);

edit("frontend/src/App.jsx", [
  [
    "import",
    /import\s+Classes\s+from/,
    afterLine(
      /import\s+AcademicYears\s+from\s+['"]\.\/pages\/AcademicYears['"];?/,
      "\nimport Classes from './pages/Classes'",
    ),
  ],
  [
    "route",
    /path=["']\/classes["']/,
    afterLine(
      /<Route\s+path=["']\/years["']\s+element=\{<AcademicYears\s*\/>\}\s*\/>/,
      '\n        <Route path="/classes" element={<Classes />} />',
    ),
  ],
]);

edit("frontend/src/components/Layout.jsx", [
  [
    "icon",
    /LayoutGrid/,
    (t) => t.replace("CalendarRange,", "CalendarRange,\n  LayoutGrid,"),
  ],
  [
    "sidebar item",
    /to:\s*['"]\/classes['"]/,
    after(
      /\{\s*to:\s*['"]\/years['"][^}]*\},?/,
      "\n      { to: '/classes', label: 'Grades & Sections', icon: LayoutGrid, roles: ['admin'] },",
    ),
  ],
  [
    "page title",
    /['"]\/classes['"]\s*:/,
    (t) =>
      t.replace(
        /(['"]\/years['"]\s*:\s*\[[^\]]*\]),?/,
        (m, g) =>
          g +
          ",\n  '/classes': ['Grades & Sections', 'How many sections each grade has, and how big they are'],",
      ),
  ],
]);
