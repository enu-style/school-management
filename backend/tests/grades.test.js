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
  tokenFor,
} from "./helpers.js";

let year, c1, c2, math, english, exams, s1, s2, s3, adminToken, teacherToken;

beforeAll(async () => {
  await resetDb();
  year = await createYear();
  c1 = await createClass(year, "Grade 9", "A");
  c2 = await createClass(year, "Grade 9", "B");
  math = await createSubject("Math");
  english = await createSubject("English");
  exams = await createExams(year.id);
  const t1 = await createTeacher("t1@test.com", "Teacher One");
  const t2 = await createTeacher("t2@test.com", "Teacher Two");
  await assign(c1, math, t1.id);
  await assign(c1, english, t2.id);
  s1 = await createStudent("Abel A", "a@test.com", c1);
  s2 = await createStudent("Selam B", "b@test.com", c1);
  s3 = await createStudent("Dawit C", "c@test.com", c2);
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(t1.user);
});
afterAll(() => pool.end());

const mid = () => exams[2];
const payload = (
  records,
  { exam = mid(), subject = math, classId = c1 } = {},
) => ({
  class_id: classId,
  subject_id: subject,
  exam_id: exam.id,
  records,
});
const post = (token, body) =>
  api().post("/api/grades").set(bearer(token)).send(body);
const stored = async (studentId, exam = mid()) => {
  const r = await pool.query(
    "SELECT score::float AS score FROM grades WHERE student_id = $1 AND exam_id = $2 AND subject_id = $3",
    [studentId, exam.id, math],
  );
  return r.rows;
};

describe("which subjects a user can grade", () => {
  it("shows a teacher only the subjects they teach in that class", async () => {
    const res = await api()
      .get("/api/grades/subjects")
      .query({ class_id: c1 })
      .set(bearer(teacherToken));
    expect(res.body.map((s) => s.name)).toEqual(["Math"]);
  });

  it("shows an admin every subject of the class", async () => {
    const res = await api()
      .get("/api/grades/subjects")
      .query({ class_id: c1 })
      .set(bearer(adminToken));
    expect(res.body.map((s) => s.name).sort()).toEqual(["English", "Math"]);
  });

  it("lists the class students with no score yet", async () => {
    const res = await api()
      .get("/api/grades")
      .query({ class_id: c1, subject_id: math, exam_id: mid().id })
      .set(bearer(teacherToken));
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.full_name)).toEqual(["Abel A", "Selam B"]);
    expect(res.body.every((r) => r.score === null)).toBe(true);
  });
});

describe("entering marks", () => {
  it("saves a valid score, including decimals", async () => {
    const res = await post(
      teacherToken,
      payload([{ student_id: s1.id, score: 27.5 }]),
    );
    expect(res.status).toBe(200);
    expect(await stored(s1.id)).toEqual([{ score: 27.5 }]);
  });

  it("refuses a score above the maximum of the assessment", async () => {
    const res = await post(
      teacherToken,
      payload([{ student_id: s1.id, score: 35 }]),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("30");
  });

  it.each([-1, "abc"])("refuses the score %j", async (score) => {
    const res = await post(
      teacherToken,
      payload([{ student_id: s1.id, score }]),
    );
    expect(res.status).toBe(400);
  });

  it("replaces an earlier score instead of adding a second one", async () => {
    await post(teacherToken, payload([{ student_id: s1.id, score: 20 }]));
    await post(teacherToken, payload([{ student_id: s1.id, score: 28 }]));
    expect(await stored(s1.id)).toEqual([{ score: 28 }]);
  });

  it("leaves an existing score alone when its box is empty", async () => {
    const res = await post(
      teacherToken,
      payload([{ student_id: s1.id, score: "" }]),
    );
    expect(res.status).toBe(200);
    expect(await stored(s1.id)).toEqual([{ score: 28 }]);
  });

  it("uses the maximum of each assessment (the final exam allows 50)", async () => {
    const final = exams[3];
    expect(
      (
        await post(
          teacherToken,
          payload([{ student_id: s1.id, score: 50 }], { exam: final }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          teacherToken,
          payload([{ student_id: s1.id, score: 51 }], { exam: final }),
        )
      ).status,
    ).toBe(400);
  });
});

describe("who may enter marks", () => {
  it("blocks a teacher from a subject they do not teach", async () => {
    const res = await post(
      teacherToken,
      payload([{ student_id: s1.id, score: 10 }], { subject: english }),
    );
    expect(res.status).toBe(403);
  });

  it("blocks a teacher from a class that is not theirs", async () => {
    const res = await post(
      teacherToken,
      payload([{ student_id: s3.id, score: 10 }], { classId: c2 }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses students who are not in the class", async () => {
    const res = await post(
      teacherToken,
      payload([{ student_id: s3.id, score: 10 }]),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in this class/);
    expect(await stored(s3.id)).toEqual([]);
  });

  it("does not let a student enter or read marks", async () => {
    const studentToken = tokenFor(s1.user);
    const write = await post(
      studentToken,
      payload([{ student_id: s1.id, score: 30 }]),
    );
    const read = await api()
      .get("/api/grades")
      .query({ class_id: c1, subject_id: math, exam_id: mid().id })
      .set(bearer(studentToken));
    expect(write.status).toBe(403);
    expect(read.status).toBe(403);
  });
});

describe("what a student sees", () => {
  beforeAll(async () => {
    await post(
      adminToken,
      payload([
        { student_id: s1.id, score: 28 },
        { student_id: s2.id, score: 18 },
      ]),
    );
  });

  const mine = async (student) => {
    const res = await api()
      .get("/api/me/grades")
      .set(bearer(tokenFor(student.user)));
    expect(res.status).toBe(200);
    return res.body;
  };
  const midMath = (rows) =>
    rows.find((r) => r.subject_name === "Math" && r.exam_name === "Mid Exam");

  it("is only their own marks", async () => {
    expect(midMath(await mine(s1)).score).toBe(28);
    expect(midMath(await mine(s2)).score).toBe(18);
  });

  it("lists every subject and assessment, with empty cells where nothing is entered yet", async () => {
    const rows = await mine(s1);
    expect(rows).toHaveLength(8);
    const eng = rows.find(
      (r) => r.subject_name === "English" && r.exam_name === "Mid Exam",
    );
    expect(eng.score).toBeNull();
  });
});

describe("closed academic years", () => {
  it("cannot be graded", async () => {
    await pool.query(
      "UPDATE academic_years SET status = 'closed' WHERE id = $1",
      [year.id],
    );
    const res = await post(
      adminToken,
      payload([{ student_id: s1.id, score: 5 }]),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/closed/);
  });
});
