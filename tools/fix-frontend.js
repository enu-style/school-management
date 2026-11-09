const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')

function edit(file, steps) {
  const full = path.join(root, file)
  let text = fs.readFileSync(full, 'utf8')
  for (const [label, done, fn] of steps) {
    if (done.test(text)) { console.log('already done  ', label); continue }
    const next = fn(text)
    if (next === text) { console.log('NOT FOUND     ', label); continue }
    text = next
    console.log('OK            ', label)
  }
  fs.writeFileSync(full, text)
}

edit('frontend/src/components/Layout.jsx', [
  ['icons',
    /CalendarRange[^;]*?from\s*['"]lucide-react['"]/,
    (t) => t.replace('CalendarCheck,', 'CalendarCheck,\n  CalendarRange,\n  TrendingUp,')],

  ['sidebar items',
    /to:\s*['"]\/years['"]/,
    (t) => t.replace(/\{\s*to:\s*['"]\/attendance['"][^}]*\},?/, (m) =>
      m.replace(/\},?$/, '},') +
      "\n      { to: '/years', label: 'Academic Years', icon: CalendarRange, roles: ['admin'] }," +
      "\n      { to: '/promotion', label: 'Promotion', icon: TrendingUp, roles: ['admin'] },")],

  ['page titles',
    /['"]\/promotion['"]\s*:/,
    (t) => t.replace(/(['"]\/change-password['"]\s*:\s*\[[^\]]*\]),?/, (m, g) =>
      g +
      ",\n  '/years': ['Academic Years', 'Years, semesters, and their dates']," +
      "\n  '/promotion': ['Promotion', 'Move students to the next academic year'],")],
])

edit('frontend/src/pages/Students.jsx', [
  ['student history import',
    /import StudentHistory/,
    (t) => t.replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\.\/components\/Feedback['"];?/, (m) =>
      m + "\nimport StudentHistory from '../components/StudentHistory'")],
])
