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

let year, closed, math, T, adminToken, teacherToken;

beforeAll(async () => {
  await resetDb();
  year = await createYear("2026/2027");
  closed = await createYear("2025/2026", "closed");
  math = await createSubject("Math");
  T = await createTeacher("t@test.com", "Teacher One");
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(T.user);
});
afterAll(() => pool.end());

const call = (token, method, url, body) => {
  const r = api()[method](url).set(bearer(token));
  return body === undefined ? r : r.send(body);
};
const setCount = (grade, count, extra = {}) =>
  call(adminToken, "put", "/api/classes/grade-sections", {
    year_id: year.id,
    grade_no: grade,
    count,
    ...extra,
  });
const sections = async (yearId, grade) =>
  (
    await pool.query(
      "SELECT section FROM classes WHERE academic_year_id = $1 AND name = $2 ORDER BY section",
      [yearId, `Grade ${grade}`],
    )
  ).rows.map((r) => r.section);
const classId = async (yearId, grade, section) =>
  (
    await pool.query(
      "SELECT id FROM classes WHERE academic_year_id = $1 AND name = $2 AND section = $3",
      [yearId, `Grade ${grade}`, section],
    )
  ).rows[0]?.id;
const capacityOf = async (id) =>
  (await pool.query("SELECT capacity FROM classes WHERE id = $1", [id])).rows[0]
    .capacity;
const overview = async () =>
  (await call(adminToken, "get", `/api/classes/overview?year_id=${year.id}`))
    .body;
const gradeOf = (o, n) => o.grades.find((g) => g.grade_no === n);

describe("who may manage sections", () => {
  it("is admin only", async () => {
    expect(
      (await call(teacherToken, "get", "/api/classes/overview")).status,
    ).toBe(403);
    expect(
      (
        await call(teacherToken, "put", "/api/classes/grade-sections", {
          year_id: year.id,
          grade_no: 9,
          count: 3,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(teacherToken, "post", "/api/classes", {
          grade_no: 9,
          section: "A",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(teacherToken, "put", "/api/classes/capacity", {
          year_id: year.id,
          grade_no: 9,
          capacity: 30,
        })
      ).status,
    ).toBe(403);
  });

  it("lets a teacher read the class list", async () => {
    expect((await call(teacherToken, "get", "/api/classes")).status).toBe(200);
  });
});

describe("the number of sections per grade", () => {
  it("creates sections A to C", async () => {
    const res = await setCount(9, 3);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ added: ["A", "B", "C"], removed: [] });
    expect(await sections(year.id, 9)).toEqual(["A", "B", "C"]);
    const row = await pool.query(
      "SELECT academic_year, academic_year_id FROM classes WHERE name = 'Grade 9' LIMIT 1",
    );
    expect(row.rows[0]).toEqual({
      academic_year: "2026/2027",
      academic_year_id: year.id,
    });
  });

  it("raises it to seven, A to G", async () => {
    const res = await setCount(9, 7);
    expect(res.body).toEqual({ added: ["D", "E", "F", "G"], removed: [] });
    expect(await sections(year.id, 9)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("lets every grade have its own number", async () => {
    await setCount(1, 2);
    const o = await overview();
    expect(o.grades).toHaveLength(12);
    expect(gradeOf(o, 9).sections).toHaveLength(7);
    expect(gradeOf(o, 1).sections).toHaveLength(2);
    expect(gradeOf(o, 12).sections).toHaveLength(0);
    expect(o.totals).toEqual({ sections: 9, students: 0 });
  });

  it("lowers it by removing the last empty sections", async () => {
    const res = await setCount(9, 5);
    expect(res.body).toEqual({ added: [], removed: ["F", "G"] });
    expect(await sections(year.id, 9)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("does nothing when the number is already right", async () => {
    const res = await setCount(9, 5);
    expect(res.body).toEqual({ added: [], removed: [] });
  });

  it.each([[27], [-1], [1.5], ["abc"]])(
    "rejects %j sections",
    async (count) => {
      expect((await setCount(9, count)).status).toBe(400);
    },
  );

  it("rejects a bad grade", async () => {
    expect((await setCount(13, 3)).status).toBe(400);
    expect((await setCount(0, 3)).status).toBe(400);
  });
});

describe("sections that are in use", () => {
  let student;

  beforeAll(async () => {
    await setCount(5, 4);
    student = await createStudent(
      "Abel A",
      "a@test.com",
      await classId(year.id, 5, "B"),
    );
  });

  it("keeps a section with students and changes nothing", async () => {
    const res = await setCount(5, 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Grade 5 - B/);
    expect(await sections(year.id, 5)).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps a section with attendance records", async () => {
    await pool.query(
      "INSERT INTO attendance (student_id, class_id, date, status) VALUES ($1, $2, '2026-10-05', 'present')",
      [student.id, await classId(year.id, 5, "D")],
    );
    const res = await setCount(5, 3);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Grade 5 - D/);
  });

  it("deletes an empty section but not one with students", async () => {
    expect(
      (
        await call(
          adminToken,
          "delete",
          `/api/classes/${await classId(year.id, 5, "B")}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          adminToken,
          "delete",
          `/api/classes/${await classId(year.id, 5, "C")}`,
        )
      ).status,
    ).toBe(200);
    expect(await sections(year.id, 5)).toEqual(["A", "B", "D"]);
  });

  it("answers 404 for an unknown section and 400 for a bad id", async () => {
    expect(
      (await call(adminToken, "delete", "/api/classes/999999")).status,
    ).toBe(404);
    expect((await call(adminToken, "delete", "/api/classes/abc")).status).toBe(
      400,
    );
  });
});

describe("adding one section", () => {
  it("adds a section and refuses a duplicate", async () => {
    const ok = await call(adminToken, "post", "/api/classes", {
      grade_no: 6,
      section: "A",
      year_id: year.id,
    });
    expect(ok.status).toBe(201);
    const dup = await call(adminToken, "post", "/api/classes", {
      grade_no: 6,
      section: "A",
      year_id: year.id,
    });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/already exists/);
  });

  it("still accepts the older name and section form for the active year", async () => {
    const res = await call(adminToken, "post", "/api/classes", {
      name: "Grade 6",
      section: "B",
    });
    expect(res.status).toBe(201);
    expect(await sections(year.id, 6)).toEqual(["A", "B"]);
  });

  it.each([
    [{ grade_no: 13, section: "A" }],
    [{ grade_no: 6, section: "" }],
    [{ grade_no: 6, section: "THISISTOOLONG" }],
    [{ section: "A" }],
  ])("rejects %j", async (body) => {
    expect((await call(adminToken, "post", "/api/classes", body)).status).toBe(
      400,
    );
  });
});

describe("copying subjects and teachers into new sections", () => {
  it("copies from the first section that has assignments", async () => {
    await setCount(8, 1);
    await assign(await classId(year.id, 8, "A"), math, T.id);
    const res = await setCount(8, 3, { copy_subjects: true });
    expect(res.body.added).toEqual(["B", "C"]);
    const rows = await pool.query(
      `SELECT c.section, cs.subject_id, cs.teacher_id FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id WHERE c.name = 'Grade 8' ORDER BY c.section`,
    );
    expect(rows.rows).toEqual(
      ["A", "B", "C"].map((section) => ({
        section,
        subject_id: math,
        teacher_id: T.id,
      })),
    );
  });

  it("does not copy when it is not asked for", async () => {
    const res = await call(adminToken, "post", "/api/classes", {
      grade_no: 8,
      section: "D",
      year_id: year.id,
    });
    expect(res.status).toBe(201);
    const n = await pool.query(
      "SELECT COUNT(*)::int AS n FROM class_subjects WHERE class_id = $1",
      [res.body.id],
    );
    expect(n.rows[0].n).toBe(0);
  });

  it("removes the assignments together with a removed section", async () => {
    const c = await classId(year.id, 8, "C");
    expect((await setCount(8, 2)).body.removed).toEqual(["C", "D"]);
    const n = await pool.query(
      "SELECT COUNT(*)::int AS n FROM class_subjects WHERE class_id = $1",
      [c],
    );
    expect(n.rows[0].n).toBe(0);
  });
});

describe("capacity", () => {
  let a;

  beforeAll(async () => {
    await setCount(7, 2);
    a = await classId(year.id, 7, "A");
  });

  const put = (id, body) => call(adminToken, "put", `/api/classes/${id}`, body);

  it("sets and clears the capacity of one section", async () => {
    expect((await put(a, { capacity: 40 })).status).toBe(200);
    expect(await capacityOf(a)).toBe(40);
    expect((await put(a, { capacity: "" })).status).toBe(200);
    expect(await capacityOf(a)).toBeNull();
  });

  it.each([[0], [201], ["abc"], [1.5], [-3]])(
    "rejects the capacity %j",
    async (capacity) => {
      expect((await put(a, { capacity })).status).toBe(400);
    },
  );

  it("answers 404 for an unknown section", async () => {
    expect((await put(999999, { capacity: 30 })).status).toBe(404);
  });

  it("sets one capacity for every section of a grade", async () => {
    const res = await call(adminToken, "put", "/api/classes/capacity", {
      year_id: year.id,
      grade_no: 7,
      capacity: 35,
    });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(await capacityOf(a)).toBe(35);
    expect(await capacityOf(await classId(year.id, 7, "B"))).toBe(35);
  });

  it("shows capacity and student counts in the overview and the class list", async () => {
    await createStudent("Selam B", "s@test.com", a);
    const section = gradeOf(await overview(), 7).sections.find(
      (s) => s.section === "A",
    );
    expect(section).toMatchObject({ students: 1, capacity: 35 });
    const list = await call(teacherToken, "get", "/api/classes");
    expect(list.body.find((c) => c.id === a).student_count).toBe(1);
  });
});

describe("closed academic years", () => {
  it("are read-only", async () => {
    const old = await createClass(closed, "Grade 3", "A");
    const closedCount = await call(
      adminToken,
      "put",
      "/api/classes/grade-sections",
      { year_id: closed.id, grade_no: 3, count: 4 },
    );
    expect(closedCount.status).toBe(400);
    expect(closedCount.body.error).toMatch(/closed/);
    const add = await call(adminToken, "post", "/api/classes", {
      grade_no: 3,
      section: "B",
      year_id: closed.id,
    });
    expect(add.status).toBe(400);
    expect(
      (await call(adminToken, "delete", `/api/classes/${old}`)).status,
    ).toBe(400);
    expect(
      (await call(adminToken, "put", `/api/classes/${old}`, { capacity: 30 }))
        .status,
    ).toBe(400);
    const bulk = await call(adminToken, "put", "/api/classes/capacity", {
      year_id: closed.id,
      grade_no: 3,
      capacity: 30,
    });
    expect(bulk.status).toBe(400);
    expect(await sections(closed.id, 3)).toEqual(["A"]);
  });
});
