const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')

const root = path.join(__dirname, '..')
const backend = path.join(root, 'backend')
const docsDir = path.join(root, 'docs')
const need = createRequire(path.join(backend, 'package.json'))
need('dotenv').config({ path: path.join(backend, '.env'), quiet: true })

const today = new Date().toISOString().slice(0, 10)
const ROLES = ['admin', 'teacher', 'student', 'parent', 'accountant']

const TITLES = {
  auth: 'Authentication', students: 'Students', teachers: 'Teachers', classes: 'Classes',
  subjects: 'Subjects', assignments: 'Teacher assignments', attendance: 'Attendance',
  exams: 'Assessments', grades: 'Grades', me: 'Student portal', reports: 'Reports',
  announcements: 'Announcements', password: 'Passwords', card: 'Report cards',
  stats: 'Dashboard statistics', statsExtra: 'Dashboard statistics (extra)', audit: 'Audit log',
  years: 'Academic years and promotion', guardians: 'Parents (admin)', parent: 'Parent portal',
  fees: 'Fees and payments', parentFees: 'Parent fees portal', users: 'Accountant accounts',
  timetable: 'Timetable',
}

const read = (f) => fs.readFileSync(f, 'utf8')
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const roleList = (src) => [...src.matchAll(/['"](\w+)['"]/g)].map((m) => m[1])
const narrow = (current, next) => (current ? current.filter((r) => next.includes(r)) : next)
const unquote = (s) => s.replace(/(['"`])[^'"`]*\1/g, '')
const who = (e) =>
  e.public ? 'Public' : e.roles ? (e.roles.length ? e.roles.join(', ') : 'nobody (check the code)') : 'Any logged-in user'

// ---------- 1. Read the routes from the source files ----------

function parseRouteFile(file) {
  const text = read(path.join(backend, 'src', 'routes', file + '.js'))

  const aliases = {}
  for (const m of text.matchAll(/const\s+(\w+)\s*=\s*authorize\(([^)]*)\)/g)) aliases[m[1]] = roleList(m[2])

  let fileAuth = false
  let fileRoles = null
  for (const m of text.matchAll(/^[ \t]*router\.use\(([^\n]*)\)[ \t]*;?[ \t]*$/gm)) {
    const line = m[1]
    if (/\bauthenticate\b/.test(line)) fileAuth = true
    const a = line.match(/authorize\(([^)]*)\)/)
    if (a) fileRoles = narrow(fileRoles, roleList(a[1]))
    for (const [name, list] of Object.entries(aliases)) {
      if (new RegExp('\\b' + name + '\\b').test(unquote(line))) fileRoles = narrow(fileRoles, list)
    }
  }

  const skip = new Set(['authenticate', 'authorize', ...Object.keys(aliases)])
  const endpoints = []
  const re = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g
  let m
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 500)
    const head = after.split(/\basync\b|=>|\bfunction\b/)[0]
    const bare = unquote(head)

    let roles = fileRoles
    const a = head.match(/authorize\(([^)]*)\)/)
    if (a) roles = narrow(roles, roleList(a[1]))
    for (const [name, list] of Object.entries(aliases)) {
      if (new RegExp('\\b' + name + '\\b').test(bare)) roles = narrow(roles, list)
    }

    const extras = [...new Set((bare.match(/[A-Za-z_]\w*/g) || []).filter((w) => !skip.has(w)))]

    const lines = text.slice(0, m.index).split('\n')
    lines.pop()
    let k = lines.length - 1
    while (k >= 0 && !lines[k].trim()) k--
    const comment = k >= 0 && lines[k].trim().startsWith('//') ? lines[k].trim().replace(/^\/\/\s*/, '') : ''

    endpoints.push({
      method: m[1].toUpperCase(),
      path: m[3],
      public: !(fileAuth || /\bauthenticate\b/.test(head)),
      roles,
      extras,
      description: comment,
    })
  }
  return endpoints
}

function collectRoutes() {
  const app = read(path.join(backend, 'src', 'app.js'))
  const requires = {}
  for (const m of app.matchAll(/const\s+(\w+)\s*=\s*require\(\s*['"]\.\/routes\/(\w+)['"]\s*\)/g)) requires[m[1]] = m[2]

  const modules = []
  let routeFileEndpoints = 0
  for (const m of app.matchAll(/app\.use\(\s*['"](\/api\/[\w-]+)['"]\s*,\s*(\w+)\s*\)/g)) {
    const file = requires[m[2]]
    if (!file) continue
    const endpoints = parseRouteFile(file).map((e) => ({ ...e, path: m[1] + (e.path === '/' ? '' : e.path) }))
    routeFileEndpoints += endpoints.length
    modules.push({ file, title: TITLES[file] || file, endpoints })
  }

  const system = [...app.matchAll(/app\.get\(\s*['"]([^'"]+)['"]/g)].map((m) => ({
    method: 'GET', path: m[1], public: true, roles: null, extras: [],
    description: m[1] === '/' ? 'API health check' : 'Checks the database connection',
  }))
  if (system.length) modules.push({ file: 'system', title: 'System', endpoints: system })
  return { modules, routeFileEndpoints, systemCount: system.length }
}

// ---------- 2. API.md ----------

function apiMarkdown(modules) {
  const md = [
    '# API reference',
    '',
    `Generated on ${today} by node tools/gen-docs.js from the route files. Do not edit by hand.`,
    '',
    '## Conventions',
    '',
    '- Base path: /api. Requests and responses are JSON.',
    '- Log in with POST /api/auth/login. Send the returned token in the header "Authorization: Bearer <token>". A token is valid for 1 day.',
    '- Errors look like { "error": "message" }. Status codes: 400 validation, 401 missing or invalid token, 403 role or ownership, 404 not found, 413 body over 10 KB, 429 rate limit, 500 server error (no internal details).',
    '- Rate limits: 300 requests per 15 minutes per IP, and 5 failed logins per 15 minutes per IP.',
    '- Lists with a page parameter (audit log, invoices, payments) answer { rows, total, page, pages }.',
    '- Dates are YYYY-MM-DD. Money is sent as a decimal number with at most 2 decimals.',
    '- The "Who" column is the role check on the route. Many routes also check ownership, for example an assigned class or a linked child. See PERMISSIONS.md.',
  ]
  for (const mod of modules) {
    md.push('', `## ${mod.title}`, '', '| Method | Path | Who | Description |', '|---|---|---|---|')
    for (const e of mod.endpoints) {
      const note = e.extras.length ? `also checks: ${e.extras.join(', ')}` : ''
      const text = [e.description, note && `(${note})`].filter(Boolean).join(' ')
      md.push(`| ${e.method} | \`${esc(e.path)}\` | ${esc(who(e))} | ${esc(text)} |`)
    }
  }
  return md.join('\n') + '\n'
}

// ---------- 3. PERMISSIONS.md ----------

function permissionsMarkdown(modules) {
  const allowed = (e, role) => e.public || !e.roles || e.roles.includes(role)
  const md = [
    '# Roles and permissions',
    '',
    `Generated on ${today} by node tools/gen-docs.js. The matrix is built from the role checks in the route files.`,
    '',
    '## Role matrix',
    '',
    'A tick means every endpoint of the module is open to the role. A fraction means only some endpoints are. A dash means none.',
    '',
    `| Module | ${ROLES.join(' | ')} |`,
    `|---|${ROLES.map(() => '---').join('|')}|`,
  ]
  for (const mod of modules) {
    const cells = ROLES.map((r) => {
      const n = mod.endpoints.length
      const a = mod.endpoints.filter((e) => allowed(e, r)).length
      return a === n ? 'yes' : a === 0 ? '-' : `${a}/${n}`
    })
    md.push(`| ${mod.title} | ${cells.join(' | ')} |`)
  }
  md.push(
    '',
    '## Rules beyond the role',
    '',
    'A role check says who may call an endpoint. These rules decide whose data they may touch. They are enforced on the server.',
    '',
    '| Role | Data scope |',
    '|---|---|',
    '| admin | Everything, but a closed academic year is read-only for everyone. Only an admin can void a payment, cancel an invoice, give a discount, or reset passwords. |',
    '| teacher | Attendance only for classes where the teacher teaches a subject. Marks and subject reports only for the subjects assigned to them in that class. Report cards only for students of those classes. Dashboard numbers only for those classes. Can read any class timetable. |',
    '| student | Only their own record. The student id comes from the login token, never from the URL: results, report card, attendance, timetable. |',
    '| parent | Only children linked to them. Every parent route checks the link in the student_guardians table before it answers. Parents see fees, invoices, and receipts of those children only, and never voided payments. |',
    '| accountant | Finance only: fee setup, invoices, payments, receipts, and fee reports. Cannot give discounts, void, or cancel. |',
    '',
    '## Roles in the original specification that are not built',
    '',
    'The specification lists 13 roles. Five exist. The school director, school administrator, super administrator, registrar, and academic director are all covered by the single admin role. Department head, librarian, store manager, and receptionist are not built.',
    '',
    '## How this is tested',
    '',
    'backend/tests/security.test.js calls every protected endpoint with every role and checks that the wrong roles get 403 and a missing token gets 401. The data-scope rules are tested in attendance, grades, results, parent, fees, and timetable tests.',
  )
  return md.join('\n') + '\n'
}

// ---------- 4. DATABASE.md ----------

const GROUPS = [
  ['People and security', ['users', 'students', 'teachers', 'guardians', 'student_guardians', 'audit_logs']],
  ['Academic structure', ['academic_years', 'semesters', 'classes', 'subjects', 'class_subjects', 'student_enrollments']],
  ['Assessment, attendance, and news', ['exams', 'grades', 'attendance', 'announcements']],
  ['Timetable', ['classrooms', 'timetable_periods', 'timetable_entries']],
  ['Finance', ['school_settings', 'fee_types', 'fee_structures', 'invoices', 'invoice_items', 'payments']],
]

const TRIGGER_NOTES = {
  trg_sync_enrollment: 'Keeps student_enrollments in step when a student changes class.',
  trg_sync_timetable_teacher: 'Moves timetable lessons to the new teacher when an assignment changes.',
  trg_no_delete_payments: 'Payments can never be deleted.',
  trg_no_delete_invoices: 'Invoices can never be deleted.',
  trg_no_delete_items: 'Invoice items can never be deleted.',
  trg_no_update_items: 'Invoice items cannot be edited.',
  trg_protect_payment: 'Payments cannot be edited, only voided, and a void cannot be undone.',
  trg_protect_invoice: 'An invoice cannot change student or year, and a cancellation cannot be undone.',
}

async function databaseMarkdown() {
  const { Client } = need('pg')
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  await client.connect()
  try {
    const q = async (sql) => (await client.query(sql)).rows
    const tables = (await q(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    )).map((r) => r.table_name)
    const views = (await q("SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name")).map((r) => r.table_name)
    const colRows = await q(
      "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position"
    )
    const cons = await q(`
      SELECT c.conrelid::regclass::text AS tbl, c.contype,
        (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
        CASE WHEN c.contype = 'f' THEN c.confrelid::regclass::text END AS ref_tbl
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype IN ('p', 'u', 'f')`)
    const indexes = await q("SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname")
    const triggers = await q(`
      SELECT event_object_table AS tbl, trigger_name, action_timing, string_agg(event_manipulation, ', ' ORDER BY event_manipulation) AS events
      FROM information_schema.triggers WHERE trigger_schema =