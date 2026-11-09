import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  bearer,
  pool,
  resetDb,
  createUser,
  createYear,
  createClass,
  createSubject,
  createTeacher,
  createStudent,
  assign,
  tokenFor,
} from "./helpers.js";

const date = "2026-11-09";
let year, c1, c2, s1, s2, s3, adminToken, teacherToken;

beforeAll(async () => {
  await resetDb();
  year = await createYear();
  c1 = await createClass(year, "Grade 9", "A");
  c2 = await createClass(year, "Grade 9", "B");
  const math = await createSubject("Math");
  const teacher = await createTeacher("teacher@test.com", "Teacher One");
  await assign(c1, math, teacher.id);
  s1 = await createStudent("Abel A", "a@test.com", c1);
  s2 = await createStudent("Selam B", "b@test.com", c1);
  s3 = await createStudent("Dawit C", "c@test.com", c2);
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(teacher.user);
});
afterAll(() => pool.end());

const save = (token, classId, records, day = date) =>
  api()
    .post("/api/attendance")
    .set(bearer(token))
    .send({ class_id: classId, date: day, records });

describe("which classes a user can take attendance for", () => {
  it("shows a teacher only their own classes", async () => {
    const res = await api()
      .get("/api/attendance/classes")
      .set(bearer(teacherToken));
    expect(res.body.map((c) => c.id)).toEqual([c1]);
  });

  it("shows an admin every class of the active year", async () => {
    const res = await api()
      .get("/api/attendance/classes")
      .set(bearer(adminToken));
    expect(res.body.map((c) => c.id).sort()).toEqual([c1, c2].sort());
  });

  it("does not show classes of a closed year to anyone", async () => {
    const old = await createYear("2025/2026", "closed");
    const oldClass = await createClass(old, "Grade 9", "A");
    const res = await api()
      .get("/api/attendance/classes")
      .set(bearer(adminToken));
    expect(res.body.map((c) => c.id)).not.toContain(oldClass);
  });
});

describe("taking attendance", () => {
  it("lists the students of the class with no status yet", async () => {
    const res = await api()
      .get("/api/attendance")
      .query({ class_id: c1, date })
      .set(bearer(teacherToken));
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.full_name)).toEqual(["Abel A", "Selam B"]);
    expect(res.body.every((r) => r.status === null)).toBe(true);
  });

  it("saves statuses for a whole class", async () => {
    const res = await save(teacherToken, c1, [
      { student_id: s1.id, status: "present" },
      { student_id: s2.id, status: "absent" },
    ]);
    expect(res.status).toBe(200);
    const rows = await pool.query(
      "SELECT student_id, status FROM attendance WHERE date = $1 ORDER BY student_id",
      [date],
    );
    expect(rows.rows).toEqual([
      { student_id: s1.id, status: "present" },
      { student_id: s2.id, status: "absent" },
    ]);
  });

  it("corrects a status without creating a duplicate record", async () => {
    await save(teacherToken, c1, [{ student_id: s2.id, status: "late" }]);
    const rows = await pool.query(
      "SELECT status FROM attendance WHERE student_id = $1 AND date = $2",
      [s2.id, date],
    );
    expect(rows.rows).toEqual([{ status: "late" }]);
  });

  it("shows the saved statuses when the class is opened again", async () => {
    const res = await api()
      .get("/api/attendance")
      .query({ class_id: c1, date })
      .set(bearer(teacherToken));
    expect(res.body.find((r) => r.student_id === s2.id).status).toBe("late");
  });

  it("rejects an unknown status", async () => {
    const res = await save(teacherToken, c1, [
      { student_id: s1.id, status: "sleeping" },
    ]);
    expect(res.status).toBe(400);
  });

  it("rejects a request without a date", async () => {
    const res = await api()
      .get("/api/attendance")
      .query({ class_id: c1 })
      .set(bearer(teacherToken));
    expect(res.status).toBe(400);
  });
});

describe("who may do it", () => {
  it("blocks a teacher from a class that is not theirs", async () => {
    const read = await api()
      .get("/api/attendance")
      .query({ class_id: c2, date })
      .set(bearer(teacherToken));
    const write = await save(teacherToken, c2, [
      { student_id: s3.id, status: "present" },
    ]);
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
  });

  it("refuses students who are not in the class", async () => {
    const res = await save(teacherToken, c1, [
      { student_id: s3.id, status: "present" },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in this class/);
    const row = await pool.query(
      "SELECT COUNT(*)::int AS n FROM attendance WHERE student_id = $1",
      [s3.id],
    );
    expect(row.rows[0].n).toBe(0);
  });

  it("refuses nonsense student ids", async () => {
    const res = await save(adminToken, c1, [
      { student_id: "abc", status: "present" },
    ]);
    expect(res.status).toBe(400);
  });
});

describe("closed academic years", () => {
  it("are read-only", async () => {
    await pool.query(
      "UPDATE academic_years SET status = 'closed' WHERE id = $1",
      [year.id],
    );
    const res = await save(
      adminToken,
      c1,
      [{ student_id: s1.id, status: "absent" }],
      "2026-11-10",
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/closed/);
  });
});
