import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  bearer,
  pool,
  resetDb,
  createUser,
  createStudent,
  tokenFor,
  eventually,
} from "./helpers.js";

const roles = ["admin", "teacher", "student", "parent", "accountant"];
const everyone = roles;
const tokens = {};

beforeAll(async () => {
  await resetDb();
  for (const role of roles)
    tokens[role] = tokenFor(await createUser(role, `${role}@test.com`));
  await createStudent("Abel Tesfaye", "abel@test.com");
});
afterAll(() => pool.end());

// Which roles may open each endpoint. Everyone else must get 403, and no token must get 401.
const endpoints = [
  ["/api/students", ["admin", "teacher"]],
  ["/api/teachers", ["admin"]],
  ["/api/classes", ["admin", "teacher"]],
  ["/api/subjects", ["admin", "teacher"]],
  ["/api/exams", ["admin", "teacher"]],
  ["/api/assignments", ["admin"]],
  ["/api/audit", ["admin"]],
  ["/api/years", ["admin"]],
  ["/api/years/active", everyone],
  ["/api/stats", ["admin", "teacher"]],
  ["/api/fees/lookups", ["admin", "accountant"]],
  ["/api/guardians", ["admin"]],
  ["/api/users", ["admin"]],
  ["/api/parent/children", ["parent"]],
  ["/api/me/grades", ["student"]],
  ["/api/timetable/classrooms", ["admin"]],
  ["/api/announcements", everyone],
];

describe.each(endpoints)("GET %s", (url, allowed) => {
  it("needs a token", async () => {
    expect((await api().get(url)).status).toBe(401);
  });

  it.each(roles)("as %s", async (role) => {
    const res = await api().get(url).set(bearer(tokens[role]));
    if (allowed.includes(role)) {
      expect([401, 403]).not.toContain(res.status);
      expect(res.status).toBeLessThan(500);
    } else {
      expect(res.status).toBe(403);
    }
  });
});

describe("HTTP hardening", () => {
  it("sends security headers and hides the framework", async () => {
    const res = await api().get("/");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows the frontend origin", async () => {
    const res = await api().get("/").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("does not allow other origins", async () => {
    const res = await api().get("/").set("Origin", "http://evil.example");
    const allowed = res.headers["access-control-allow-origin"];
    expect(allowed).not.toBe("http://evil.example");
    expect(allowed).not.toBe("*");
  });

  it("answers unknown URLs with a JSON 404", async () => {
    const res = await api().get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });

  it("answers broken JSON with 400", async () => {
    const res = await api()
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid JSON");
  });

  it("rejects an oversized body with 413", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "a".repeat(20000), password: "x" });
    expect(res.status).toBe(413);
  });
});

describe("injection and mass assignment", () => {
  it("treats SQL in a search as plain text", async () => {
    const attack = "'; DROP TABLE students; --";
    const res = await api()
      .get("/api/students")
      .query({ search: attack })
      .set(bearer(tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    const still = await pool.query("SELECT COUNT(*)::int AS n FROM students");
    expect(still.rows[0].n).toBe(1);
  });

  it("does not let the request choose the role of a new student", async () => {
    const res = await api()
      .post("/api/students")
      .set(bearer(tokens.admin))
      .send({
        email: "sneaky@test.com",
        password: "Student123",
        full_name: "Sneaky",
        role: "admin",
        class_id: null,
      });
    expect(res.status).toBe(201);
    const user = await pool.query("SELECT role FROM users WHERE email = $1", [
      "sneaky@test.com",
    ]);
    expect(user.rows[0].role).toBe("student");
  });

  it("never returns password hashes in lists", async () => {
    const students = await api().get("/api/students").set(bearer(tokens.admin));
    const teachers = await api().get("/api/teachers").set(bearer(tokens.admin));
    expect(JSON.stringify(students.body)).not.toContain("password");
    expect(JSON.stringify(teachers.body)).not.toContain("password");
  });
});

describe("audit log", () => {
  it("records a create action without the password", async () => {
    await api()
      .post("/api/students")
      .set(bearer(tokens.admin))
      .send({
        email: "newkid@test.com",
        password: "SuperSecret99",
        full_name: "New Kid",
        class_id: null,
      });

    const row = await eventually(async () => {
      const r = await pool.query(
        "SELECT details FROM audit_logs WHERE action = 'create' AND entity = 'students' AND details->'body'->>'email' = 'newkid@test.com'",
      );
      return r.rows[0];
    });
    expect(row.details.body.password).toBe("[hidden]");
    expect(JSON.stringify(row.details)).not.toContain("SuperSecret99");
  });

  it("records a failed login with the email that was tried", async () => {
    await api()
      .post("/api/auth/login")
      .send({ email: "ghost@test.com", password: "WrongPassword1" });
    const row = await eventually(async () => {
      const r = await pool.query(
        "SELECT user_email FROM audit_logs WHERE action = 'login_failed' AND user_email = 'ghost@test.com'",
      );
      return r.rows[0];
    });
    expect(row.user_email).toBe("ghost@test.com");
  });
});
