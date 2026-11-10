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

let c1, kid1, kid2, kid3, kid4, P1, P2, adminToken, teacherToken, studentToken;

beforeAll(async () => {
  await resetDb();
  const year = await createYear();
  c1 = await createClass(year, "Grade 5", "A");
  const math = await createSubject("Math");
  const exams = await createExams(year.id);
  const T = await createTeacher("t@test.com", "Teacher One");
  await assign(c1, math, T.id);
  kid1 = await createStudent("Abel A", "k1@test.com", c1);
  kid2 = await createStudent("Selam B", "k2@test.com", c1);
  kid3 = await createStudent("Dawit C", "k3@test.com", c1);
  kid4 = await createStudent("Eden D", "k4@test.com", c1);
  await setTotal(kid1.id, math, exams, 75);
  await setTotal(kid3.id, math, exams, 60);
  await pool.query(
    "INSERT INTO attendance (student_id, class_id, date, status) VALUES ($1, $2, '2026-10-05', 'present'), ($3, $2, '2026-10-05', 'absent')",
    [kid1.id, c1, kid2.id],
  );
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(T.user);
  studentToken = tokenFor(kid1.user);
});
afterAll(() => pool.end());

const call = (token, method, url, body) => {
  const r = api()[method](url).set(bearer(token));
  return body === undefined ? r : r.send(body);
};

async function makeParent(email, name) {
  const res = await call(adminToken, "post", "/api/guardians", {
    email,
    password: "Parent1234",
    full_name: name,
    phone: "0911000000",
  });
  expect(res.status).toBe(201);
  return {
    guardianId: res.body.id,
    userId: res.body.user_id,
    token: tokenFor({ id: res.body.user_id, role: "parent" }),
  };
}

const link = (parent, kid, relationship = "father") =>
  call(adminToken, "post", `/api/guardians/${parent.guardianId}/children`, {
    student_id: kid.id,
    relationship,
  });

describe("administering parents", () => {
  it("creates a parent with a login that works", async () => {
    P1 = await makeParent("p1@test.com", "Parent One");
    const user = await pool.query("SELECT role FROM users WHERE id = $1", [
      P1.userId,
    ]);
    expect(user.rows[0].role).toBe("parent");
    const login = await api()
      .post("/api/auth/login")
      .send({ email: "p1@test.com", password: "Parent1234" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("parent");
  });

  it("refuses a duplicate email and a weak password", async () => {
    const dup = await call(adminToken, "post", "/api/guardians", {
      email: "p1@test.com",
      password: "Parent1234",
      full_name: "Again",
    });
    expect(dup.status).toBe(400);
    const weak = await call(adminToken, "post", "/api/guardians", {
      email: "weak@test.com",
      password: "short",
      full_name: "Weak",
    });
    expect(weak.status).toBe(400);
  });

  it("is closed to teachers and parents", async () => {
    const body = {
      email: "x@test.com",
      password: "Parent1234",
      full_name: "X",
    };
    expect(
      (await call(teacherToken, "post", "/api/guardians", body)).status,
    ).toBe(403);
    expect((await call(P1.token, "post", "/api/guardians", body)).status).toBe(
      403,
    );
  });

  it("links two children to one parent, and one child can have two parents", async () => {
    P2 = await makeParent("p2@test.com", "Parent Two");
    expect((await link(P1, kid1, "father")).status).toBe(201);
    expect((await link(P1, kid2, "mother")).status).toBe(201);
    expect((await link(P2, kid3, "father")).status).toBe(201);
    expect((await link(P2, kid1, "mother")).status).toBe(201);

    const list = await call(adminToken, "get", "/api/guardians");
    const p1 = list.body.find((g) => g.full_name === "Parent One");
    expect(p1.children.map((c) => c.full_name).sort()).toEqual([
      "Abel A",
      "Selam B",
    ]);
  });

  it("links the same pair only once and updates the relationship", async () => {
    expect((await link(P1, kid1, "guardian")).status).toBe(201);
    const rows = await pool.query(
      "SELECT relationship FROM student_guardians WHERE guardian_id = $1 AND student_id = $2",
      [P1.guardianId, kid1.id],
    );
    expect(rows.rows).toEqual([{ relationship: "guardian" }]);
    await link(P1, kid1, "father");
  });

  it("refuses an unknown relationship, student, or parent", async () => {
    expect((await link(P1, kid3, "cousin")).status).toBe(400);
    expect((await link(P1, { id: 999999 })).status).toBe(404);
    const res = await call(
      adminToken,
      "post",
      "/api/guardians/999999/children",
      { student_id: kid3.id, relationship: "father" },
    );
    expect(res.status).toBe(404);
  });

  it("deleting a parent removes their login and links but not the students", async () => {
    const P3 = await makeParent("p3@test.com", "Parent Three");
    await link(P3, kid4);
    const res = await call(
      adminToken,
      "delete",
      `/api/guardians/${P3.guardianId}`,
    );
    expect(res.status).toBe(200);
    const users = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE email = 'p3@test.com'",
    );
    const links = await pool.query(
      "SELECT COUNT(*)::int AS n FROM student_guardians WHERE guardian_id = $1",
      [P3.guardianId],
    );
    const kid = await pool.query(
      "SELECT COUNT(*)::int AS n FROM students WHERE id = $1",
      [kid4.id],
    );
    expect([users.rows[0].n, links.rows[0].n, kid.rows[0].n]).toEqual([
      0, 0, 1,
    ]);
  });
});

describe("what a parent can see", () => {
  it("lists only their own children, with this year's attendance", async () => {
    const res = await call(P1.token, "get", "/api/parent/children");
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.full_name)).toEqual(["Abel A", "Selam B"]);
    expect(res.body[0]).toMatchObject({
      present: 1,
      absent: 0,
      late: 0,
      relationship: "father",
    });
    expect(res.body[1]).toMatchObject({ present: 0, absent: 1 });
  });

  it("lists a different set for a different parent", async () => {
    const res = await call(P2.token, "get", "/api/parent/children");
    expect(res.body.map((c) => c.full_name)).toEqual(["Abel A", "Dawit C"]);
  });

  it("shows the marks of a linked child", async () => {
    const res = await call(
      P1.token,
      "get",
      `/api/parent/children/${kid1.id}/grades`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body.find((r) => r.exam_name === "Final Exam").score).toBe(50);
    expect(res.body.find((r) => r.exam_name === "Mid Exam").score).toBe(25);
  });

  it("shows the attendance of a linked child", async () => {
    const res = await call(
      P1.token,
      "get",
      `/api/parent/children/${kid1.id}/attendance`,
    );
    expect(res.body).toEqual([{ date: "2026-10-05", status: "present" }]);
  });

  it("shows the report card of a linked child", async () => {
    const res = await call(
      P1.token,
      "get",
      `/api/parent/children/${kid1.id}/card?term=Semester%201`,
    );
    expect(res.status).toBe(200);
    expect(res.body.student.full_name).toBe("Abel A");
    expect(res.body).toMatchObject({
      average: 75,
      grade: "C",
      status: "Promoted",
    });
  });

  it("needs a term for the report card", async () => {
    expect(
      (await call(P1.token, "get", `/api/parent/children/${kid1.id}/card`))
        .status,
    ).toBe(400);
  });

  it("shows the timetable and fees pages of a linked child", async () => {
    const t = await call(
      P1.token,
      "get",
      `/api/timetable/for-student/${kid1.id}`,
    );
    expect(t.status).toBe(200);
    const f = await call(
      P1.token,
      "get",
      `/api/parent-fees/children/${kid1.id}/invoices`,
    );
    expect(f.status).toBe(200);
    expect(f.body.invoices).toEqual([]);
  });
});

describe("what a parent cannot see", () => {
  const pages = [
    ["grades", "/grades"],
    ["attendance", "/attendance"],
    ["the report card", "/card?term=Semester%201"],
  ];

  it.each(pages)(
    "refuses %s of a child who is not theirs",
    async (_label, suffix) => {
      const other = await call(
        P1.token,
        "get",
        `/api/parent/children/${kid3.id}${suffix}`,
      );
      const unlinked = await call(
        P1.token,
        "get",
        `/api/parent/children/${kid4.id}${suffix}`,
      );
      const reverse = await call(
        P2.token,
        "get",
        `/api/parent/children/${kid2.id}${suffix}`,
      );
      expect([other.status, unlinked.status, reverse.status]).toEqual([
        403, 403, 403,
      ]);
      expect(other.body.error).toMatch(/not linked/);
    },
  );

  it("refuses the timetable and fees of a child who is not theirs", async () => {
    expect(
      (await call(P1.token, "get", `/api/timetable/for-student/${kid3.id}`))
        .status,
    ).toBe(403);
    expect(
      (
        await call(
          P1.token,
          "get",
          `/api/parent-fees/children/${kid3.id}/invoices`,
        )
      ).status,
    ).toBe(403);
  });

  it("rejects a bad id", async () => {
    expect(
      (await call(P1.token, "get", "/api/parent/children/abc/grades")).status,
    ).toBe(400);
  });

  it.each([
    ["get", "/api/students"],
    ["get", "/api/attendance/classes"],
    ["get", "/api/reports/subject?class_id=1&subject_id=1&term=Semester%201"],
    ["get", "/api/card/student?student_id=1&term=Semester%201"],
    ["get", "/api/me/grades"],
    ["get", "/api/fees/payments"],
    ["get", "/api/audit"],
    ["post", "/api/grades"],
    ["post", "/api/attendance"],
    ["post", "/api/fees/invoices"],
  ])("keeps staff endpoint %s %s closed", async (method, url) => {
    expect(
      (await call(P1.token, method, url, method === "post" ? {} : undefined))
        .status,
    ).toBe(403);
  });

  it("keeps the parent endpoints closed to everyone else", async () => {
    for (const token of [studentToken, teacherToken, adminToken]) {
      expect((await call(token, "get", "/api/parent/children")).status).toBe(
        403,
      );
      expect(
        (await call(token, "get", `/api/parent/children/${kid1.id}/grades`))
          .status,
      ).toBe(403);
    }
  });
});

describe("removing a link", () => {
  it("takes the access away straight away", async () => {
    expect(
      (await call(P1.token, "get", `/api/parent/children/${kid2.id}/grades`))
        .status,
    ).toBe(200);
    const res = await call(
      adminToken,
      "delete",
      `/api/guardians/${P1.guardianId}/children/${kid2.id}`,
    );
    expect(res.status).toBe(200);
    expect(
      (await call(P1.token, "get", `/api/parent/children/${kid2.id}/grades`))
        .status,
    ).toBe(403);
    const list = await call(P1.token, "get", "/api/parent/children");
    expect(list.body.map((c) => c.full_name)).toEqual(["Abel A"]);
  });
});
