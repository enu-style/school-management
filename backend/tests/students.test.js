import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  bearer,
  pool,
  resetDb,
  createUser,
  createYear,
  createClass,
  createStudent,
  tokenFor,
} from "./helpers.js";

let year, c1, c2, adminToken, teacherToken, studentToken;

beforeAll(async () => {
  await resetDb();
  year = await createYear();
  c1 = await createClass(year, "Grade 9", "A");
  c2 = await createClass(year, "Grade 9", "B");
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(await createUser("teacher", "teacher@test.com"));
  studentToken = tokenFor(await createUser("student", "kid@test.com"));
});
afterAll(() => pool.end());

const create = (token, data) =>
  api().post("/api/students").set(bearer(token)).send(data);
const valid = {
  email: "abel@test.com",
  password: "Student123",
  full_name: "Abel Tesfaye",
  gender: "male",
  date_of_birth: "2010-05-12",
};

describe("registering a student", () => {
  it("creates the account, the profile, and the first enrollment together", async () => {
    const res = await create(adminToken, { ...valid, class_id: c1 });
    expect(res.status).toBe(201);
    expect(res.body.full_name).toBe("Abel Tesfaye");

    const user = await pool.query("SELECT role FROM users WHERE id = $1", [
      res.body.user_id,
    ]);
    expect(user.rows[0].role).toBe("student");

    const enrollment = await pool.query(
      "SELECT academic_year_id, class_id, status FROM student_enrollments WHERE student_id = $1",
      [res.body.id],
    );
    expect(enrollment.rows).toEqual([
      { academic_year_id: year.id, class_id: c1, status: "enrolled" },
    ]);
  });

  it("lets the new student log in", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: valid.email, password: valid.password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("student");
  });

  it("refuses a duplicate email and leaves no half-created records", async () => {
    const res = await create(adminToken, { ...valid, class_id: c1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email already registered");
    const n = await pool.query(
      "SELECT COUNT(*)::int AS n FROM students WHERE full_name = 'Abel Tesfaye'",
    );
    expect(n.rows[0].n).toBe(1);
  });

  it.each([
    ["a weak password", { password: "short" }],
    ["an invalid email", { email: "not-an-email" }],
    ["no name", { full_name: undefined }],
  ])("rejects %s", async (_label, change) => {
    const res = await create(adminToken, {
      ...valid,
      email: "other@test.com",
      ...change,
    });
    expect(res.status).toBe(400);
  });

  it("is forbidden for teachers and students", async () => {
    expect(
      (await create(teacherToken, { ...valid, email: "x1@test.com" })).status,
    ).toBe(403);
    expect(
      (await create(studentToken, { ...valid, email: "x2@test.com" })).status,
    ).toBe(403);
  });
});

describe("listing and searching", () => {
  beforeAll(async () => {
    await createStudent("Selam Hailu", "selam@test.com", c1);
    await createStudent("Dawit Mekonnen", "dawit@test.com", c2);
  });

  it("lets a teacher list students, with class details", async () => {
    const res = await api().get("/api/students").set(bearer(teacherToken));
    expect(res.status).toBe(200);
    const selam = res.body.find((s) => s.full_name === "Selam Hailu");
    expect(selam.class_name).toBe("Grade 9");
    expect(selam.section).toBe("A");
  });

  it("does not let a student list other students", async () => {
    expect(
      (await api().get("/api/students").set(bearer(studentToken))).status,
    ).toBe(403);
  });

  it("searches without caring about capital letters", async () => {
    const res = await api()
      .get("/api/students")
      .query({ search: "SELAM" })
      .set(bearer(adminToken));
    expect(res.body.map((s) => s.full_name)).toEqual(["Selam Hailu"]);
  });

  it("hides graduated students", async () => {
    await pool.query(
      "UPDATE students SET status = 'graduated' WHERE full_name = 'Dawit Mekonnen'",
    );
    const res = await api().get("/api/students").set(bearer(adminToken));
    expect(res.body.map((s) => s.full_name)).not.toContain("Dawit Mekonnen");
  });
});

describe("updating and deleting", () => {
  let student;

  beforeAll(async () => {
    student = await createStudent("Temp Kid", "temp@test.com", c1);
  });

  it("moves a student to another section and keeps one enrollment for the year", async () => {
    const res = await api()
      .put(`/api/students/${student.id}`)
      .set(bearer(adminToken))
      .send({
        full_name: "Temp Kid Renamed",
        gender: "female",
        date_of_birth: "2010-01-01",
        class_id: c2,
      });
    expect(res.status).toBe(200);

    const row = await pool.query(
      "SELECT full_name, class_id FROM students WHERE id = $1",
      [student.id],
    );
    expect(row.rows[0]).toEqual({
      full_name: "Temp Kid Renamed",
      class_id: c2,
    });

    const enrollments = await pool.query(
      "SELECT class_id FROM student_enrollments WHERE student_id = $1",
      [student.id],
    );
    expect(enrollments.rows).toEqual([{ class_id: c2 }]);
  });

  it("returns 404 for an unknown student", async () => {
    const res = await api()
      .put("/api/students/999999")
      .set(bearer(adminToken))
      .send({
        full_name: "Nobody",
        gender: "male",
        date_of_birth: null,
        class_id: null,
      });
    expect(res.status).toBe(404);
  });

  it("does not let a teacher delete", async () => {
    expect(
      (
        await api()
          .delete(`/api/students/${student.id}`)
          .set(bearer(teacherToken))
      ).status,
    ).toBe(403);
  });

  it("deletes the student, the login account, and the enrollment", async () => {
    const res = await api()
      .delete(`/api/students/${student.id}`)
      .set(bearer(adminToken));
    expect(res.status).toBe(200);
    const users = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE email = 'temp@test.com'",
    );
    const enrollments = await pool.query(
      "SELECT COUNT(*)::int AS n FROM student_enrollments WHERE student_id = $1",
      [student.id],
    );
    expect(users.rows[0].n).toBe(0);
    expect(enrollments.rows[0].n).toBe(0);
  });

  it("returns 404 when deleting an unknown student", async () => {
    expect(
      (await api().delete("/api/students/999999").set(bearer(adminToken)))
        .status,
    ).toBe(404);
  });
});
