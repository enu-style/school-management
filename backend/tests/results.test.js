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

const term = "Semester 1";
let c1, math, english, exams, T, T2, T3, A, B, C, E, adminToken;

beforeAll(async () => {
  await resetDb();
  const year = await createYear();
  c1 = await createClass(year, "Grade 9", "A");
  math = await createSubject("Math");
  english = await createSubject("English");
  exams = await createExams(year.id, term);
  T = await createTeacher("t1@test.com", "Teacher One");
  T2 = await createTeacher("t2@test.com", "Teacher Two");
  T3 = await createTeacher("t3@test.com", "Teacher Three");
  await assign(c1, math, T.id);
  A = await createStudent("Abel A", "a@test.com", c1);
  B = await createStudent("Selam B", "b@test.com", c1);
  C = await createStudent("Dawit C", "c@test.com", c1);
  E = await createStudent("No Class", "e@test.com", null);
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
});
afterAll(() => pool.end());

const card = (id, token = adminToken) =>
  api()
    .get("/api/card/student")
    .query({ student_id: id, term })
    .set(bearer(token));

describe("report card calculations", () => {
  it("shows Incomplete, with no letter grade, while marks are missing", async () => {
    const res = await card(B.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Incomplete");
    expect(res.body.grade).toBeNull();
    expect(res.body.subjects[0].grade).toBeNull();
    expect(res.body.totalMax).toBe(100);
  });

  // total out of 100 -> letter grade and promotion status (pass mark is 50)
  it.each([
    [100, "A", "Promoted"],
    [90, "A", "Promoted"],
    [89, "B", "Promoted"],
    [80, "B", "Promoted"],
    [79, "C", "Promoted"],
    [70, "C", "Promoted"],
    [69, "D", "Promoted"],
    [60, "D", "Promoted"],
    [59, "F", "Promoted"],
    [50, "F", "Promoted"],
    [49, "F", "Repeat"],
    [0, "F", "Repeat"],
  ])(
    "a total of %i gives grade %s and status %s",
    async (total, grade, status) => {
      await setTotal(A.id, math, exams, total);
      const res = await card(A.id);
      expect(res.status).toBe(200);
      expect(res.body.subjects[0].total).toBe(total);
      expect(res.body.subjects[0].grade).toBe(grade);
      expect(res.body.grade).toBe(grade);
      expect(res.body.average).toBe(total);
      expect(res.body.status).toBe(status);
    },
  );

  it("ranks classmates by average", async () => {
    await setTotal(A.id, math, exams, 90);
    await setTotal(B.id, math, exams, 60);
    await setTotal(C.id, math, exams, 75);
    const [a, b, c] = await Promise.all([card(A.id), card(B.id), card(C.id)]);
    expect([a.body.rank, c.body.rank, b.body.rank]).toEqual([1, 2, 3]);
    expect(a.body.class_size).toBe(3);
  });

  it("gives tied students the same rank", async () => {
    await setTotal(B.id, math, exams, 90);
    const [a, b, c] = await Promise.all([card(A.id), card(B.id), card(C.id)]);
    expect([a.body.rank, b.body.rank, c.body.rank]).toEqual([1, 1, 3]);
  });

  it("handles a student who is not in a class yet", async () => {
    const res = await card(E.id);
    expect(res.status).toBe(200);
    expect(res.body.noClass).toBe(true);
  });

  it("needs a student and a term", async () => {
    const res = await api().get("/api/card/student").set(bearer(adminToken));
    expect(res.status).toBe(400);
  });
});

describe("who may open a report card", () => {
  it("lets a student open only their own", async () => {
    const own = await api()
      .get("/api/card/me")
      .query({ term })
      .set(bearer(tokenFor(A.user)));
    const other = await api()
      .get("/api/card/me")
      .query({ term })
      .set(bearer(tokenFor(C.user)));
    expect(own.body.student.full_name).toBe("Abel A");
    expect(other.body.student.full_name).toBe("Dawit C");
  });

  it("does not let a student open someone else by id", async () => {
    const res = await card(C.id, tokenFor(A.user));
    expect(res.status).toBe(403);
  });

  it("lets a teacher open students of their classes only", async () => {
    expect((await card(A.id, tokenFor(T.user))).status).toBe(200);
    const outsider = await card(A.id, tokenFor(T3.user));
    expect(outsider.status).toBe(403);
  });
});

describe("subject reports", () => {
  const report = (token) =>
    api()
      .get("/api/reports/subject")
      .query({ class_id: c1, subject_id: math, term })
      .set(bearer(token));

  it("show every student with every assessment", async () => {
    const res = await report(adminToken);
    expect(res.status).toBe(200);
    expect(res.body.exams).toHaveLength(4);
    expect(res.body.students).toHaveLength(3);
  });

  it("are blocked for a teacher who does not teach the subject", async () => {
    expect((await report(tokenFor(T3.user))).status).toBe(403);
    expect((await report(tokenFor(T.user))).status).toBe(200);
  });
});

describe("a subject added later", () => {
  it("makes the card Incomplete again and counts the missing subject as zero in the average", async () => {
    await assign(c1, english, T2.id);
    const res = await card(A.id);
    expect(res.body.subjects).toHaveLength(2);
    expect(res.body.status).toBe("Incomplete");
    expect(res.body.average).toBe(45);
  });
});
