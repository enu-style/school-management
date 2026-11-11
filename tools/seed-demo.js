const path = require("path");
const { createRequire } = require("module");

const root = path.join(__dirname, "..");
const backend = path.join(root, "backend");
const need = createRequire(path.join(backend, "package.json"));
need("dotenv").config({ path: path.join(backend, ".env"), quiet: true });
const { Client } = need("pg");
const bcrypt = need("bcrypt");

const SOURCE = process.env.DB_NAME;
const DEMO = "school_management_demo";
const PASSWORD = "Demo12345";
const YEAR = "2026/2027";

// A fixed seed, so the demo data is the same every time
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const iso = (d) => d.toLocaleDateString("en-CA");

const FIRST = [
  ["Abel", "male"],
  ["Selam", "female"],
  ["Dawit", "male"],
  ["Hana", "female"],
  ["Biruk", "male"],
  ["Meron", "female"],
  ["Yonas", "male"],
  ["Tigist", "female"],
  ["Henok", "male"],
  ["Liya", "female"],
  ["Kidus", "male"],
  ["Ruth", "female"],
  ["Samuel", "male"],
  ["Eden", "female"],
  ["Nahom", "male"],
  ["Rahel", "female"],
  ["Natnael", "male"],
  ["Helen", "female"],
  ["Elias", "male"],
  ["Marta", "female"],
];
const FATHER = [
  "Tesfaye",
  "Hailu",
  "Mekonnen",
  "Bekele",
  "Alemu",
  "Girma",
  "Tadesse",
  "Wolde",
  "Assefa",
  "Kebede",
  "Demissie",
  "Lemma",
  "Negash",
  "Abebe",
  "Haile",
];
const SUBJECTS = [
  "Mathematics",
  "English",
  "Physics",
  "Biology",
  "Chemistry",
  "History",
];
const TEACHERS = [
  "Mulugeta Assefa",
  "Tsehay Bekele",
  "Getachew Lemma",
  "Almaz Desta",
  "Kassahun Worku",
  "Frehiwot Negash",
];
const PARENTS = [
  "Tadesse Wolde",
  "Mulu Kebede",
  "Girma Alemu",
  "Aster Haile",
  "Bekele Negash",
  "Zenash Tesfaye",
  "Abebe Lemma",
  "Senait Hailu",
];

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

async function main() {
  if (process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is set. This script is for your local database only.",
    );
  if (!SOURCE || SOURCE === DEMO || SOURCE.endsWith("_test")) {
    throw new Error(
      "DB_NAME in backend/.env must be your normal local database.",
    );
  }

  // 1. A fresh copy of the structure (this closes every connection to your database, so stop the backend first)
  const admin = await connect("postgres");
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ANY($1::text[]) AND pid <> pg_backend_pid()",
    [[SOURCE, DEMO]],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${DEMO}"`);
  await admin.query(`CREATE DATABASE "${DEMO}" TEMPLATE "${SOURCE}"`);
  await admin.end();

  const c = await connect(DEMO);
  const db = await c.query("SELECT current_database() AS name");
  if (db.rows[0].name !== DEMO)
    throw new Error("Not connected to the demo database. Stopping.");

  const q = (sql, params) => c.query(sql, params);
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const user = async (role, email) =>
    (
      await q(
        "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
        [email, hash, role],
      )
    ).rows[0].id;

  await q("BEGIN");
  try {
    // 2. Wipe the copy
    const tables = (
      await q("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    ).rows.map((t) => `"${t.tablename}"`);
    await q(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
    await q("ALTER SEQUENCE invoice_seq RESTART WITH 1");
    await q("ALTER SEQUENCE receipt_seq RESTART WITH 1");

    // 3. Year, settings
    const yearId = (
      await q(
        "INSERT INTO academic_years (name, start_date, end_date, status) VALUES ($1, '2026-09-01', '2027-06-30', 'active') RETURNING id",
        [YEAR],
      )
    ).rows[0].id;
    await q(
      `INSERT INTO semesters (academic_year_id, name, start_date, end_date) VALUES
       ($1, 'Semester 1', '2026-09-01', '2027-01-31'), ($1, 'Semester 2', '2027-02-01', '2027-06-30')`,
      [yearId],
    );
    await q(
      "INSERT INTO school_settings (key, value) VALUES ('currency', 'ETB')",
    );
    const feeType = {};
    for (const n of ["Tuition", "Registration", "Examination"]) {
      feeType[n] = (
        await q("INSERT INTO fee_types (name) VALUES ($1) RETURNING id", [n])
      ).rows[0].id;
    }

    // 4. Staff
    const adminId = await user("admin", "admin@demo.school");
    const accountantId = await user("accountant", "accountant@demo.school");
    const subjectIds = [];
    for (const s of SUBJECTS)
      subjectIds.push(
        (await q("INSERT INTO subjects (name) VALUES ($1) RETURNING id", [s]))
          .rows[0].id,
      );
    const teacherIds = [];
    for (let i = 0; i < TEACHERS.length; i++) {
      const uid = await user("teacher", `teacher${i + 1}@demo.school`);
      teacherIds.push(
        (
          await q(
            "INSERT INTO teachers (user_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id",
            [uid, TEACHERS[i], `09110000${i}0`],
          )
        ).rows[0].id,
      );
    }

    // 5. Classes: Grades 1 to 12, sections A and B, each subject taught by one teacher
    const classes = {};
    for (let g = 1; g <= 12; g++) {
      for (const s of ["A", "B"]) {
        const id = (
          await q(
            "INSERT INTO classes (name, section, academic_year, academic_year_id, capacity) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [`Grade ${g}`, s, YEAR, yearId, g >= 9 ? 45 : 35],
          )
        ).rows[0].id;
        classes[`${g}${s}`] = id;
        for (let k = 0; k < SUBJECTS.length; k++) {
          await q(
            "INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ($1, $2, $3)",
            [id, subjectIds[k], teacherIds[k]],
          );
        }
      }
    }

    // 6. Students: 10 in each of 9A, 9B, 10A, 10B, and 2 in section A of every other grade
    const plan = [];
    for (const key of ["9A", "9B", "10A", "10B"])
      for (let i = 0; i < 10; i++) plan.push(key);
    for (const g of [1, 2, 3, 4, 5, 6, 7, 8, 11, 12])
      plan.push(`${g}A`, `${g}A`);
    const students = [];
    for (let n = 0; n < plan.length; n++) {
      const key = plan[n];
      const g = parseInt(key, 10);
      const [first, gender] = FIRST[n % FIRST.length];
      const father = FATHER[Math.floor(n / FIRST.length) % FATHER.length];
      const uid = await user("student", `student${n + 1}@demo.school`);
      const dob = `${2026 - (5 + g)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`;
      const id = (
        await q(
          "INSERT INTO students (user_id, full_name, gender, date_of_birth, class_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [uid, `${first} ${father}`, gender, dob, classes[key]],
        )
      ).rows[0].id;
      students.push({
        id,
        key,
        g,
        ability: rand() < 0.1 ? 0.3 + rand() * 0.15 : 0.5 + rand() * 0.45,
      });
    }

    // 7. Assessments and Semester 1 marks (10B has no final exam yet)
    const exams = [];
    for (const term of ["Semester 1", "Semester 2"]) {
      for (const [name, max] of [
        ["Individual Assignment", 10],
        ["Group Assignment", 10],
        ["Mid Exam", 30],
        ["Final Exam", 50],
      ]) {
        const id = (
          await q(
            "INSERT INTO exams (name, term, max_score, academic_year_id) VALUES ($1, $2, $3, $4) RETURNING id",
            [name, term, max, yearId],
          )
        ).rows[0].id;
        exams.push({ id, term, name, max });
      }
    }
    const gs = [],
      gj = [],
      ge = [],
      gv = [];
    for (const s of students.filter((x) => x.g === 9 || x.g === 10)) {
      for (const subjectId of subjectIds) {
        for (const e of exams.filter((x) => x.term === "Semester 1")) {
          if (s.key === "10B" && e.name === "Final Exam") continue;
          const frac = Math.min(
            1,
            Math.max(0, s.ability + (rand() - 0.5) * 0.25),
          );
          gs.push(s.id);
          gj.push(subjectId);
          ge.push(e.id);
          gv.push(Math.round(e.max * frac * 2) / 2);
        }
      }
    }
    await q(
      "INSERT INTO grades (student_id, subject_id, exam_id, score) SELECT * FROM unnest($1::int[], $2::int[], $3::int[], $4::numeric[])",
      [gs, gj, ge, gv],
    );

    // 8. Attendance for the last 8 school days
    const days = [];
    for (let i = 0; days.length < 8; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(iso(d));
    }
    const as = [],
      ac = [],
      ad = [],
      at = [];
    for (const s of students.filter((x) => x.g === 9 || x.g === 10)) {
      for (const day of days) {
        const r = rand();
        as.push(s.id);
        ac.push(classes[s.key]);
        ad.push(day);
        at.push(r < 0.88 ? "present" : r < 0.95 ? "late" : "absent");
      }
    }
    await q(
      "INSERT INTO attendance (student_id, class_id, date, status) SELECT * FROM unnest($1::int[], $2::int[], $3::date[], $4::text[])",
      [as, ac, ad, at],
    );

    // 9. Parents
    const parentIds = [];
    for (let i = 0; i < PARENTS.length; i++) {
      const uid = await user("parent", `parent${i + 1}@demo.school`);
      parentIds.push(
        (
          await q(
            "INSERT INTO guardians (user_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id",
            [uid, PARENTS[i], `09220000${i}0`],
          )
        ).rows[0].id,
      );
    }
    const link = (p, s, rel) =>
      q(
        "INSERT INTO student_guardians (student_id, guardian_id, relationship) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [s, parentIds[p], rel],
      );
    for (let k = 0; k < parentIds.length; k++) {
      await link(k, students[k * 5].id, k % 2 ? "mother" : "father");
      if (k < 4)
        await link(k, students[k * 5 + 1].id, k % 2 ? "mother" : "father");
    }
    await link(7, students[0].id, "mother");

    // 10. Classrooms and a timetable for 9A, 9B, 10A, 10B
    const roomIds = [];
    for (let i = 0; i < 10; i++)
      roomIds.push(
        (
          await q(
            "INSERT INTO classrooms (name, capacity) VALUES ($1, 45) RETURNING id",
            [`Room ${101 + i}`],
          )
        ).rows[0].id,
      );
    await q(
      "INSERT INTO classrooms (name, capacity) VALUES ('Science Lab', 30)",
    );

    const periodRows = [];
    let t = 8 * 60;
    const hm = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    for (let i = 1; i <= 8; i++) {
      periodRows.push([`Period ${i}`, hm(t), hm(t + 40), false]);
      t += 40;
      if (i === 3) {
        periodRows.push(["Break", hm(t), hm(t + 20), true]);
        t += 20;
      }
      if (i === 5) {
        periodRows.push(["Lunch", hm(t), hm(t + 40), true]);
        t += 40;
      }
    }
    const lessonPeriods = [];
    for (const [name, start, end, brk] of periodRows) {
      const id = (
        await q(
          "INSERT INTO timetable_periods (name, start_time, end_time, is_break) VALUES ($1, $2, $3, $4) RETURNING id",
          [name, start, end, brk],
        )
      ).rows[0].id;
      if (!brk) lessonPeriods.push(id);
    }
    // Each class starts at a different subject, so no teacher or room is ever used twice at the same time
    const ttClasses = ["9A", "9B", "10A", "10B"];
    for (let ci = 0; ci < ttClasses.length; ci++) {
      for (let day = 1; day <= 5; day++) {
        for (let p = 0; p < lessonPeriods.length; p++) {
          const k = (p + day + ci) % SUBJECTS.length;
          await q(
            `INSERT INTO timetable_entries (academic_year_id, class_id, subject_id, teacher_id, classroom_id, day, period_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              yearId,
              classes[ttClasses[ci]],
              subjectIds[k],
              teacherIds[k],
              roomIds[ci],
              day,
              lessonPeriods[p],
            ],
          );
        }
      }
    }

    // 11. Announcements
    for (const [title, body] of [
      [
        "Welcome to the new academic year",
        "Classes start on 1 September. Please check the timetable and bring your books.",
      ],
      [
        "Semester 1 mid exams",
        "Mid exams run during the second week of December. The schedule is on the notice board.",
      ],
      [
        "Parent and teacher meeting",
        "Parents are invited to meet class teachers on the first Saturday of next month.",
      ],
    ])
      await q(
        "INSERT INTO announcements (title, body, created_by) VALUES ($1, $2, $3)",
        [title, body, adminId],
      );

    // 12. Fees, invoices, and payments
    for (let g = 1; g <= 12; g++) {
      for (const [name, amount] of [
        ["Tuition", 800 + g * 100],
        ["Registration", 200],
        ["Examination", 100],
      ]) {
        await q(
          "INSERT INTO fee_structures (academic_year_id, grade_no, fee_type_id, amount) VALUES ($1, $2, $3, $4)",
          [yearId, g, feeType[name], amount],
        );
      }
    }
    const methods = ["cash", "bank_transfer", "mobile_money", "cheque"];
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const items = [
        ["Tuition", 800 + s.g * 100],
        ["Registration", 200],
        ["Examination", 100],
      ];
      const total = items.reduce((a, x) => a + x[1], 0);
      const inv = (
        await q(
          `INSERT INTO invoices (invoice_no, student_id, academic_year_id, due_date, created_by)
         VALUES ('INV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('invoice_seq')::text, 6, '0'), $1, $2, '2026-12-31', $3)
         RETURNING id`,
          [s.id, yearId, accountantId],
        )
      ).rows[0].id;
      for (const [description, amount] of items) {
        await q(
          "INSERT INTO invoice_items (invoice_id, description, amount) VALUES ($1, $2, $3)",
          [inv, description, amount],
        );
      }
      const pay = i % 5 === 0 ? 0 : i % 5 === 1 ? Math.round(total / 2) : total;
      if (pay > 0) {
        const d = new Date();
        d.setDate(d.getDate() - (i % 30));
        await q(
          `INSERT INTO payments (receipt_no, invoice_id, amount, method, reference, paid_date, received_by)
           VALUES ('RCT-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0'), $1, $2, $3, $4, $5::date, $6)`,
          [inv, pay, methods[i % 4], `REF-${1000 + i}`, iso(d), accountantId],
        );
      }
    }

    await q("COMMIT");
  } catch (err) {
    await q("ROLLBACK");
    throw err;
  } finally {
    await c.end();
  }

  console.log(
    `\nDemo database "${DEMO}" is ready. Every account uses the password ${PASSWORD}.`,
  );
  console.log("  admin       admin@demo.school");
  console.log("  teacher     teacher1@demo.school ... teacher6@demo.school");
  console.log("  accountant  accountant@demo.school");
  console.log("  parent      parent1@demo.school ... parent8@demo.school");
  console.log("  student     student1@demo.school ... student60@demo.school");
  console.log("\nRun the backend on it with:");
  console.log("  cd backend && DB_NAME=school_management_demo npm run dev");
}

main().catch((err) => {
  console.error("\nSeeding failed:", err.message);
  process.exit(1);
});
