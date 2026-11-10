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
  createExams,
  setTotal,
  tokenFor,
} from "./helpers.js";

let year1, year2, c9, math, exams, T, T2, A, B, C, G, adminToken, teacherToken;

beforeAll(async () => {
  await resetDb();
  year1 = await createYear("2026/2027");
  c9 = await createClass(year1, "Grade 9", "A");
  await createClass(year1, "Grade 10", "A");
  const c12 = await createClass(year1, "Grade 12", "A");
  math = await createSubject("Math");
  exams = await createExams(year1.id);
  T = await createTeacher("t1@test.com", "Teacher One");
  T2 = await createTeacher("t2@test.com", "Teacher Two");
  await assign(c9, math, T.id);
  await assign(c12, math, T.id);
  A = await createStudent("Abel A", "a@test.com", c9);
  B = await createStudent("Selam B", "b@test.com", c9);
  C = await createStudent("Dawit C", "c@test.com", c9);
  G = await createStudent("Grace G", "g@test.com", c12);
  await setTotal(A.id, math, exams, 80);
  await setTotal(B.id, math, exams, 30);
  await setTotal(G.id, math, exams, 70);
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(T.user);
});
afterAll(() => pool.end());

const call = (token, method, url, body) => {
  const r = api()[method](url).set(bearer(token));
  return body === undefined ? r : r.send(body);
};

const classIn = async (yearId, name, section) =>
  (
    await pool.query(
      "SELECT id FROM classes WHERE academic_year_id = $1 AND name = $2 AND section = $3",
      [yearId, name, section],
    )
  ).rows[0].id;

const enrollments = async (studentId) =>
  (
    await pool.query(
      `SELECT y.name AS year, c.name AS class_name, c.section, e.status
     FROM student_enrollments e
     JOIN academic_years y ON y.id = e.academic_year_id
     LEFT JOIN classes c ON c.id = e.class_id
     WHERE e.student_id = $1 ORDER BY y.start_date`,
      [studentId],
    )
  ).rows;

describe("creating an academic year", () => {
  const good = {
    name: "2027/2028",
    start_date: "2027-09-01",
    end_date: "2028-06-30",
  };
  const create = (data, token = adminToken) =>
    call(token, "post", "/api/years", data);

  it.each([
    ["a name that is not a year pair", { name: "2027-2028" }],
    ["two years that do not follow each other", { name: "2027/2029" }],
    ["an end before the start", { end_date: "2027-08-01" }],
    ["a missing date", { start_date: undefined }],
  ])("rejects %s", async (_label, change) => {
    expect((await create({ ...good, ...change })).status).toBe(400);
  });

  it("is admin only", async () => {
    expect((await create(good, teacherToken)).status).toBe(403);
  });

  it("creates the year with two semesters and copies classes, assignments, and assessments", async () => {
    const res = await create({ ...good, copy_from: year1.id });
    expect(res.status).toBe(201);
    year2 = { id: res.body.id, name: good.name };

    const status = await pool.query(
      "SELECT status FROM academic_years WHERE id = $1",
      [year2.id],
    );
    expect(status.rows[0].status).toBe("upcoming");

    const sems = await pool.query(
      "SELECT name FROM semesters WHERE academic_year_id = $1 ORDER BY name",
      [year2.id],
    );
    expect(sems.rows.map((r) => r.name)).toEqual(["Semester 1", "Semester 2"]);

    const classes = await pool.query(
      "SELECT name, section FROM classes WHERE academic_year_id = $1",
      [year2.id],
    );
    expect(classes.rows.map((r) => `${r.name} ${r.section}`).sort()).toEqual([
      "Grade 10 A",
      "Grade 12 A",
      "Grade 9 A",
    ]);

    const assigned = await pool.query(
      "SELECT cs.teacher_id FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE c.academic_year_id = $1",
      [year2.id],
    );
    expect(assigned.rows).toEqual([{ teacher_id: T.id }, { teacher_id: T.id }]);

    const copied = await pool.query(
      "SELECT COUNT(*)::int AS n, SUM(max_score)::float AS total FROM exams WHERE academic_year_id = $1",
      [year2.id],
    );
    expect(copied.rows[0]).toEqual({ n: 4, total: 100 });

    const students = await pool.query(
      "SELECT COUNT(*)::int AS n FROM student_enrollments WHERE academic_year_id = $1",
      [year2.id],
    );
    expect(students.rows[0].n).toBe(0);
  });

  it("refuses a duplicate name", async () => {
    const res = await create(good);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
  });

  it("updates the dates", async () => {
    const res = await call(adminToken, "put", `/api/years/${year2.id}`, {
      start_date: "2027-09-05",
      end_date: "2028-06-25",
    });
    expect(res.status).toBe(200);
    const row = await pool.query(
      "SELECT to_char(start_date, 'YYYY-MM-DD') AS s, to_char(end_date, 'YYYY-MM-DD') AS e FROM academic_years WHERE id = $1",
      [year2.id],
    );
    expect(row.rows[0]).toEqual({ s: "2027-09-05", e: "2028-06-25" });
  });

  it("refuses bad dates when editing, and an unknown year", async () => {
    const bad = await call(adminToken, "put", `/api/years/${year2.id}`, {
      start_date: "2028-01-01",
      end_date: "2027-01-01",
    });
    expect(bad.status).toBe(400);
    const unknown = await call(adminToken, "put", "/api/years/999999", {
      start_date: "2027-09-01",
      end_date: "2028-06-30",
    });
    expect(unknown.status).toBe(404);
  });

  it("lists the years for an admin only", async () => {
    const res = await call(adminToken, "get", "/api/years");
    expect(res.body.map((y) => y.name).sort()).toEqual([
      "2026/2027",
      "2027/2028",
    ]);
    expect((await call(teacherToken, "get", "/api/years")).status).toBe(403);
  });
});

describe("enrollment history before promotion", () => {
  it("shows the first enrollment", async () => {
    const res = await call(adminToken, "get", `/api/years/history/${A.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        year: "2026/2027",
        class_name: "Grade 9",
        section: "A",
        status: "enrolled",
      },
    ]);
  });

  it("lets a teacher see only students of their own classes", async () => {
    expect(
      (await call(teacherToken, "get", `/api/years/history/${A.id}`)).status,
    ).toBe(200);
    expect(
      (await call(tokenFor(T2.user), "get", `/api/years/history/${A.id}`))
        .status,
    ).toBe(403);
  });

  it("rejects a bad id", async () => {
    expect(
      (await call(adminToken, "get", "/api/years/history/abc")).status,
    ).toBe(400);
  });
});

describe("promotion preview", () => {
  const preview = (params = {}, token = adminToken) =>
    call(
      token,
      "get",
      `/api/years/promotion/preview?${new URLSearchParams({ from_year: year1.id, to_year: year2.id, ...params })}`,
    );
  const row = (res, name) => res.body.rows.find((r) => r.full_name === name);

  it("lists the enrolled students of the old year", async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r) => r.full_name).sort()).toEqual([
      "Abel A",
      "Dawit C",
      "Grace G",
      "Selam B",
    ]);
  });

  it("suggests promote, repeat, review, and graduate from the full-year result", async () => {
    const res = await preview();
    expect(row(res, "Abel A")).toMatchObject({
      percent: 80,
      complete: true,
      suggestion: "promote",
    });
    expect(row(res, "Selam B")).toMatchObject({
      percent: 30,
      suggestion: "repeat",
    });
    expect(row(res, "Dawit C")).toMatchObject({
      percent: null,
      complete: false,
      suggestion: "review",
    });
    expect(row(res, "Grace G")).toMatchObject({
      percent: 70,
      suggestion: "graduate",
    });
  });

  it("names the class each student would move to", async () => {
    const res = await preview();
    expect(row(res, "Abel A").promote_to).toBe("Grade 10 - A");
    expect(row(res, "Abel A").repeat_to).toBe("Grade 9 - A");
    expect(row(res, "Grace G").promote_to).toBeNull();
  });

  it("uses the pass mark that was asked for, and a result equal to it passes", async () => {
    expect(row(await preview({ pass_mark: 85 }), "Abel A").suggestion).toBe(
      "repeat",
    );
    expect(row(await preview({ pass_mark: 80 }), "Abel A").suggestion).toBe(
      "promote",
    );
  });

  it("can be limited to one grade", async () => {
    const res = await preview({ grade: "Grade 12" });
    expect(res.body.rows.map((r) => r.full_name)).toEqual(["Grace G"]);
  });

  it("refuses the same year twice and a pass mark outside 0 to 100", async () => {
    expect((await preview({ to_year: year1.id })).status).toBe(400);
    expect((await preview({ pass_mark: 150 })).status).toBe(400);
  });

  it("is admin only", async () => {
    expect((await preview({}, teacherToken)).status).toBe(403);
  });
});

describe("applying promotion", () => {
  const apply = (decisions, token = adminToken) =>
    call(token, "post", "/api/years/promotion/apply", {
      from_year: year1.id,
      to_year: year2.id,
      decisions,
    });

  it("is admin only", async () => {
    expect((await apply([], teacherToken)).status).toBe(403);
  });

  it("refuses the same year twice and an unknown decision", async () => {
    const same = await call(adminToken, "post", "/api/years/promotion/apply", {
      from_year: year1.id,
      to_year: year1.id,
      decisions: [],
    });
    expect(same.status).toBe(400);
    expect(
      (await apply([{ student_id: A.id, decision: "teleport" }])).status,
    ).toBe(400);
  });

  it("does not promote a Grade 12 student, they graduate instead", async () => {
    const res = await apply([{ student_id: G.id, decision: "promote" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/graduate instead/);
    const g = await pool.query(
      "SELECT status, class_id FROM students WHERE id = $1",
      [G.id],
    );
    expect(g.rows[0].status).toBe("active");
  });

  it("lets only Grade 12 students graduate", async () => {
    const res = await apply([{ student_id: A.id, decision: "graduate" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only Grade 12/);
  });

  it("changes nothing when one student cannot be moved", async () => {
    const zClass = await createClass(year1, "Grade 9", "Z");
    const Z = await createStudent("Zed Z", "z@test.com", zClass);
    const res = await apply([
      { student_id: A.id, decision: "promote" },
      { student_id: Z.id, decision: "promote" },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Grade 10 - Z/);
    const a = await pool.query("SELECT class_id FROM students WHERE id = $1", [
      A.id,
    ]);
    expect(a.rows[0].class_id).toBe(c9);
    expect(await enrollments(A.id)).toHaveLength(1);
  });

  it("applies promote, repeat, skip, and graduate together", async () => {
    const res = await apply([
      { student_id: A.id, decision: "promote" },
      { student_id: B.id, decision: "repeat" },
      { student_id: C.id, decision: "skip" },
      { student_id: G.id, decision: "graduate" },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(3);
  });

  it("moves a promoted student up and keeps the old enrollment", async () => {
    expect(await enrollments(A.id)).toEqual([
      {
        year: "2026/2027",
        class_name: "Grade 9",
        section: "A",
        status: "promoted",
      },
      {
        year: "2027/2028",
        class_name: "Grade 10",
        section: "A",
        status: "enrolled",
      },
    ]);
    const now = await pool.query(
      "SELECT class_id FROM students WHERE id = $1",
      [A.id],
    );
    expect(now.rows[0].class_id).toBe(await classIn(year2.id, "Grade 10", "A"));
  });

  it("puts a repeating student in the same grade of the new year", async () => {
    expect(await enrollments(B.id)).toEqual([
      {
        year: "2026/2027",
        class_name: "Grade 9",
        section: "A",
        status: "repeated",
      },
      {
        year: "2027/2028",
        class_name: "Grade 9",
        section: "A",
        status: "enrolled",
      },
    ]);
  });

  it("leaves a skipped student where they are", async () => {
    expect(await enrollments(C.id)).toEqual([
      {
        year: "2026/2027",
        class_name: "Grade 9",
        section: "A",
        status: "enrolled",
      },
    ]);
  });

  it("graduates a Grade 12 student and keeps their record", async () => {
    const g = await pool.query(
      "SELECT status, class_id FROM students WHERE id = $1",
      [G.id],
    );
    expect(g.rows[0]).toEqual({ status: "graduated", class_id: null });
    expect(await enrollments(G.id)).toEqual([
      {
        year: "2026/2027",
        class_name: "Grade 12",
        section: "A",
        status: "graduated",
      },
    ]);
    const list = await call(adminToken, "get", "/api/students");
    expect(list.body.map((s) => s.full_name)).not.toContain("Grace G");
  });

  it("keeps the marks of the old year", async () => {
    const r = await pool.query(
      "SELECT COUNT(*)::int AS n, SUM(score)::float AS total FROM grades WHERE student_id = $1",
      [A.id],
    );
    expect(r.rows[0]).toEqual({ n: 4, total: 80 });
  });

  it("shows the history newest year first", async () => {
    const res = await call(adminToken, "get", `/api/years/history/${A.id}`);
    expect(res.body.map((h) => [h.year, h.status])).toEqual([
      ["2027/2028", "enrolled"],
      ["2026/2027", "promoted"],
    ]);
  });

  it("does nothing when the same decisions are applied again", async () => {
    const res = await apply([{ student_id: A.id, decision: "promote" }]);
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(await enrollments(A.id)).toHaveLength(2);
  });

  it("no longer lists students who were already processed", async () => {
    const res = await call(
      adminToken,
      "get",
      `/api/years/promotion/preview?from_year=${year1.id}&to_year=${year2.id}`,
    );
    expect(res.body.rows.map((r) => r.full_name).sort()).toEqual([
      "Dawit C",
      "Zed Z",
    ]);
  });
});

describe("activating and closing years", () => {
  const activate = (id, token = adminToken) =>
    call(token, "post", `/api/years/${id}/activate`);
  const status = async (id) =>
    (await pool.query("SELECT status FROM academic_years WHERE id = $1", [id]))
      .rows[0].status;

  it("is admin only", async () => {
    expect((await activate(year2.id, teacherToken)).status).toBe(403);
  });

  it("changes nothing when the year does not exist", async () => {
    expect((await activate(999999)).status).toBe(404);
    expect(await status(year1.id)).toBe("active");
  });

  it("activates the new year and closes the old one", async () => {
    expect((await activate(year2.id)).status).toBe(200);
    expect(await status(year1.id)).toBe("closed");
    expect(await status(year2.id)).toBe("active");
    const n = await pool.query(
      "SELECT COUNT(*)::int AS n FROM academic_years WHERE status = 'active'",
    );
    expect(n.rows[0].n).toBe(1);
  });

  it("tells every role which year is active", async () => {
    const res = await call(teacherToken, "get", "/api/years/active");
    expect(res.body.name).toBe("2027/2028");
  });

  it("makes attendance of the old year read-only", async () => {
    const res = await call(adminToken, "post", "/api/attendance", {
      class_id: c9,
      date: "2026-11-10",
      records: [],
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/closed/);
  });

  it("makes grades of the old year read-only", async () => {
    const res = await call(adminToken, "post", "/api/grades", {
      class_id: c9,
      subject_id: math,
      exam_id: exams[2].id,
      records: [{ student_id: C.id, score: 10 }],
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/closed/);
  });

  it("does not allow promoting into a closed year", async () => {
    const res = await call(adminToken, "post", "/api/years/promotion/apply", {
      from_year: year2.id,
      to_year: year1.id,
      decisions: [{ student_id: A.id, decision: "promote" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/closed/);
  });

  it("closes the active year, and only the active year", async () => {
    expect(
      (await call(adminToken, "post", `/api/years/${year2.id}/close`)).status,
    ).toBe(200);
    expect(await status(year2.id)).toBe("closed");
    expect(
      (await call(adminToken, "post", `/api/years/${year2.id}/close`)).status,
    ).toBe(400);
  });
});
