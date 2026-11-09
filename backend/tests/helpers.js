import { createRequire } from "module";
import supertest from "supertest";

const require = createRequire(import.meta.url);
const bcrypt = require("bcrypt");

export const jwt = require("jsonwebtoken");
export const app = require("../src/app");
export const pool = require("../src/config/db");

export const api = () => supertest(app);
export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Wipes every table. It refuses to run unless the database name ends with _test.
export async function resetDb() {
  const db = await pool.query("SELECT current_database() AS name");
  if (!db.rows[0].name.endsWith("_test")) {
    throw new Error(
      `Refusing to wipe "${db.rows[0].name}". Tests only run on a database whose name ends with _test.`,
    );
  }
  const tables = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const list = tables.rows.map((t) => `"${t.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function createUser(role, email, password = "Password123") {
  const hash = await bcrypt.hash(password, 4);
  const r = await pool.query(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
    [email, hash, role],
  );
  return { id: r.rows[0].id, email, password, role };
}

// A valid login token without calling the login route
export function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

export async function createYear(name = "2026/2027", status = "active") {
  const [a, b] = name.split("/");
  const r = await pool.query(
    "INSERT INTO academic_years (name, start_date, end_date, status) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, `${a}-09-01`, `${b}-06-30`, status],
  );
  return { id: r.rows[0].id, name };
}

export async function createClass(year, name = "Grade 9", section = "A") {
  const r = await pool.query(
    "INSERT INTO classes (name, section, academic_year, academic_year_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, section, year.name, year.id],
  );
  return r.rows[0].id;
}

export async function createSubject(name) {
  const r = await pool.query(
    "INSERT INTO subjects (name) VALUES ($1) RETURNING id",
    [name],
  );
  return r.rows[0].id;
}

export async function createTeacher(email, fullName) {
  const user = await createUser("teacher", email);
  const r = await pool.query(
    "INSERT INTO teachers (user_id, full_name) VALUES ($1, $2) RETURNING id",
    [user.id, fullName],
  );
  return { id: r.rows[0].id, user };
}

export async function createStudent(fullName, email, classId = null) {
  const user = await createUser("student", email);
  const r = await pool.query(
    "INSERT INTO students (user_id, full_name, gender, class_id) VALUES ($1, $2, 'male', $3) RETURNING id",
    [user.id, fullName, classId],
  );
  return { id: r.rows[0].id, user };
}

export async function assign(classId, subjectId, teacherId) {
  await pool.query(
    `INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ($1, $2, $3)
     ON CONFLICT (class_id, subject_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
    [classId, subjectId, teacherId],
  );
}

// The four standard assessments of a semester, worth 100 marks in total
export async function createExams(yearId, term = "Semester 1") {
  const defs = [
    ["Individual Assignment", 10],
    ["Group Assignment", 10],
    ["Mid Exam", 30],
    ["Final Exam", 50],
  ];
  const out = [];
  for (const [name, max] of defs) {
    const r = await pool.query(
      "INSERT INTO exams (name, term, max_score, academic_year_id) VALUES ($1, $2, $3, $4) RETURNING id",
      [name, term, max, yearId],
    );
    out.push({ id: r.rows[0].id, name, max });
  }
  return out;
}

// Spread a total mark over the assessments (biggest first) and save it
export async function setTotal(studentId, subjectId, exams, total) {
  let left = total;
  for (const e of [...exams].sort((a, b) => b.max - a.max)) {
    const score = Math.min(left, e.max);
    left -= score;
    await pool.query(
      `INSERT INTO grades (student_id, subject_id, exam_id, score) VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, subject_id, exam_id) DO UPDATE SET score = EXCLUDED.score`,
      [studentId, subjectId, e.id, score],
    );
  }
}

// For things the server does after it has already answered (like the audit log)
export async function eventually(fn, timeout = 3000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw last || new Error("The condition was not met in time");
}
