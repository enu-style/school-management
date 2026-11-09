import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import supertest from "supertest";

const require = createRequire(import.meta.url);
const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

// Use the real limit (5) and load a fresh copy of the app, so no earlier test can change the counter
process.env.LOGIN_LIMIT = "5";
for (const key of Object.keys(require.cache)) {
  if (key.startsWith(srcDir)) delete require.cache[key];
}
const app = require("../src/app");
const pool = require("../src/config/db");

afterAll(() => pool.end());

describe("login rate limit", () => {
  it("allows 5 failed attempts and then blocks with 429", async () => {
    const codes = [];
    let last;
    for (let i = 0; i < 7; i++) {
      last = await supertest(app)
        .post("/api/auth/login")
        .send({ email: "nobody@test.com", password: "wrong-password" });
      codes.push(last.status);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429, 429]);
    expect(last.body.error).toMatch(/Too many failed login attempts/);
  });
});
