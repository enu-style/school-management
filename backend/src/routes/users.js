const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, authorize("admin"));
router.param("id", (req, res, next, v) =>
  /^\d+$/.test(v) ? next() : res.status(400).json({ error: "Invalid id" }),
);

router.get("/", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, email, created_at FROM users WHERE role = 'accountant' ORDER BY email",
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'accountant') RETURNING id, email",
      [email, hash],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ error: "Email already registered" });
    if (err.code === "23514")
      return res
        .status(500)
        .json({
          error:
            "The database does not allow the accountant role yet. Run the role SQL.",
        });
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:id/password", async (req, res) => {
  const p = req.body.new_password;
  if (typeof p !== "string" || p.length < 8 || p.length > 72) {
    return res
      .status(400)
      .json({ error: "Password must be 8 to 72 characters" });
  }
  try {
    const hash = await bcrypt.hash(p, 10);
    const r = await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2 AND role = 'accountant' RETURNING id",
      [hash, req.params.id],
    );
    if (r.rows.length === 0)
      return res.status(404).json({ error: "Accountant not found" });
    res.json({ message: "Password reset" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM users WHERE id = $1 AND role = 'accountant' RETURNING id",
      [req.params.id],
    );
    if (r.rows.length === 0)
      return res.status(404).json({ error: "Accountant not found" });
    res.json({ message: "Accountant deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
