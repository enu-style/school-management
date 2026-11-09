import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  validateLogin,
  validateNewUser,
  validateRegister,
} = require("../src/middleware/validate");

function run(middleware, body) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  middleware({ body }, res, next);
  return { res, next };
}

describe("validateLogin", () => {
  it("accepts an email and a password", () => {
    expect(
      run(validateLogin, { email: "a@b.com", password: "x" }).next,
    ).toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ email: "a@b.com" }],
    [{ email: 1, password: 2 }],
    [undefined],
  ])("rejects %j", (body) => {
    const { res, next } = run(validateLogin, body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("validateNewUser", () => {
  it("accepts a valid email and an 8 character password", () => {
    expect(
      run(validateNewUser, { email: "a@b.com", password: "12345678" }).next,
    ).toHaveBeenCalled();
  });

  it("accepts a 72 character password (the bcrypt limit)", () => {
    expect(
      run(validateNewUser, { email: "a@b.com", password: "a".repeat(72) }).next,
    ).toHaveBeenCalled();
  });

  it.each(["bad", "a@b", "@x.com", "a b@c.com", "", 5])(
    "rejects the email %j",
    (email) => {
      const { res, next } = run(validateNewUser, {
        email,
        password: "12345678",
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it.each(["1234567", "a".repeat(73), "", 12345678])(
    "rejects the password %j",
    (password) => {
      const { res, next } = run(validateNewUser, {
        email: "a@b.com",
        password,
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    },
  );
});

describe("validateRegister", () => {
  it.each(["admin", "teacher", "student"])("accepts the role %s", (role) => {
    expect(
      run(validateRegister, { email: "a@b.com", password: "12345678", role })
        .next,
    ).toHaveBeenCalled();
  });

  it.each(["king", "", undefined, "ADMIN"])("rejects the role %j", (role) => {
    const { res, next } = run(validateRegister, {
      email: "a@b.com",
      password: "12345678",
      role,
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
