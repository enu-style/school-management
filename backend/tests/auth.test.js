import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  bearer,
  jwt,
  pool,
  resetDb,
  createUser,
  tokenFor,
} from "./helpers.js";

let admin, teacher;

beforeAll(async () => {
  await resetDb();
  admin = await createUser("admin", "admin@test.com");
  teacher = await createUser("teacher", "teacher@test.com");
});
afterAll(() => pool.end());

const login = (email, password) =>
  api().post("/api/auth/login").send({ email, password });

describe("login", () => {
  it("returns a token and the user without a password", async () => {
    const res = await login(admin.email, admin.password);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toEqual({
      id: admin.id,
      email: admin.email,
      role: "admin",
    });
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  it("signs a token that holds the id and role and lasts one day", async () => {
    const { body } = await login(admin.email, admin.password);
    const decoded = jwt.decode(body.token);
    expect(decoded.id).toBe(admin.id);
    expect(decoded.role).toBe("admin");
    expect(decoded.exp - decoded.iat).toBe(86400);
  });

  it("rejects a wrong password", async () => {
    const res = await login(admin.email, "WrongPassword1");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("gives the same answer for an unknown email, so nobody can find out which emails exist", async () => {
    const unknown = await login("nobody@test.com", "WrongPassword1");
    const wrong = await login(admin.email, "WrongPassword1");
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("rejects a request with missing fields", async () => {
    const res = await api().post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });
});

describe("tokens", () => {
  const url = "/api/students";

  it("are required", async () => {
    const res = await api().get(url);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  it("must use the Bearer format", async () => {
    const res = await api()
      .get(url)
      .set({ Authorization: tokenFor(admin) });
    expect(res.status).toBe(401);
  });

  it("must be genuine", async () => {
    const res = await api().get(url).set(bearer("not.a.token"));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("are refused when expired", async () => {
    const expired = jwt.sign(
      { id: admin.id, role: "admin", exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET,
    );
    expect((await api().get(url).set(bearer(expired))).status).toBe(401);
  });

  it("are refused when signed with another secret", async () => {
    const forged = jwt.sign(
      { id: admin.id, role: "admin" },
      "another-secret-another-secret",
    );
    expect((await api().get(url).set(bearer(forged))).status).toBe(401);
  });

  it("are accepted when valid", async () => {
    expect(
      (
        await api()
          .get(url)
          .set(bearer(tokenFor(admin)))
      ).status,
    ).toBe(200);
  });
});

describe("register (admin only)", () => {
  const body = {
    email: "new@test.com",
    password: "LongEnough1",
    role: "teacher",
  };

  it("needs a token", async () => {
    expect((await api().post("/api/auth/register").send(body)).status).toBe(
      401,
    );
  });

  it("is forbidden for a teacher, even to create an admin", async () => {
    const res = await api()
      .post("/api/auth/register")
      .set(bearer(tokenFor(teacher)))
      .send({ ...body, email: "sneaky@test.com", role: "admin" });
    expect(res.status).toBe(403);
  });

  it("works for an admin, stores a hash, and the new user can log in", async () => {
    const res = await api()
      .post("/api/auth/register")
      .set(bearer(tokenFor(admin)))
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      email: body.email,
      role: "teacher",
    });

    const row = await pool.query(
      "SELECT password_hash FROM users WHERE email = $1",
      [body.email],
    );
    expect(row.rows[0].password_hash).not.toBe(body.password);
    expect(row.rows[0].password_hash.startsWith("$2")).toBe(true);

    expect((await login(body.email, body.password)).status).toBe(200);
  });

  it("refuses a duplicate email", async () => {
    const res = await api()
      .post("/api/auth/register")
      .set(bearer(tokenFor(admin)))
      .send(body);
    expect(res.status).toBe(400);
  });
});

describe("change password", () => {
  let user, token;
  const change = (data) =>
    api().post("/api/password/change").set(bearer(token)).send(data);

  beforeAll(async () => {
    user = await createUser("teacher", "changer@test.com", "OldPassword1");
    token = tokenFor(user);
  });

  it("needs the correct current password", async () => {
    const res = await change({
      current_password: "WrongOne123",
      new_password: "NewPassword1",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a short new password", async () => {
    const res = await change({
      current_password: "OldPassword1",
      new_password: "short",
    });
    expect(res.status).toBe(400);
  });

  it("changes the password, and only the new one works afterwards", async () => {
    const res = await change({
      current_password: "OldPassword1",
      new_password: "NewPassword1",
    });
    expect(res.status).toBe(200);
    expect((await login(user.email, "OldPassword1")).status).toBe(401);
    expect((await login(user.email, "NewPassword1")).status).toBe(200);
  });
});
