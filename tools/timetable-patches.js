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

edit("backend/src/server.js", [
  [
    "require line",
    /timetableRoutes\s*=/,
    afterLine(
      /const\s+yearRoutes\s*=\s*require\(['"]\.\/routes\/years['"]\);?/,
      "\nconst timetableRoutes = require('./routes/timetable');",
    ),
  ],
  [
    "route mounting",
    /app\.use\(['"]\/api\/timetable['"]/,
    afterLine(
      /app\.use\(['"]\/api\/years['"],\s*yearRoutes\);?/,
      "\napp.use('/api/timetable', timetableRoutes);",
    ),
  ],
]);

edit("frontend/src/components/Layout.jsx", [
  [
    "icon",
    /CalendarClock/,
    (t) => t.replace("CalendarRange,", "CalendarRange,\n  CalendarClock,"),
  ],
  [
    "sidebar items",
    /to:\s*['"]\/timetable['"]/,
    after(
      /\{\s*to:\s*['"]\/promotion['"][^}]*\},?/,
      "\n      { to: '/timetable', label: 'Timetable', icon: CalendarClock, roles: ['admin', 'teacher', 'student', 'parent'] }," +
        "\n      { to: '/timetable-setup', label: 'Timetable Setup', icon: Settings, roles: ['admin'] },",
    ),
  ],
  [
    "page titles",
    /['"]\/timetable['"]\s*:/,
    (t) =>
      t.replace(
        /(['"]\/promotion['"]\s*:\s*\[[^\]]*\]),?/,
        (m, g) =>
          g +
          ",\n  '/timetable': ['Timetable', 'Weekly lessons by class, teacher, and room']," +
          "\n  '/timetable-setup': ['Timetable Setup', 'Lesson periods, breaks, and classrooms'],",
      ),
  ],
]);

edit("frontend/src/App.jsx", [
  [
    "imports",
    /import\s+Timetable\s+from/,
    afterLine(
      /import\s+Promotion\s+from\s+['"]\.\/pages\/Promotion['"];?/,
      "\nimport Timetable from './pages/Timetable'\nimport TimetableSetup from './pages/TimetableSetup'",
    ),
  ],
  [
    "routes",
    /path=["']\/timetable["']/,
    afterLine(
      /<Route\s+path=["']\/promotion["']\s+element=\{<Promotion\s*\/>\}\s*\/>/,
      '\n        <Route path="/timetable" element={<Timetable />} />\n        <Route path="/timetable-setup" element={<TimetableSetup />} />',
    ),
  ],
]);
