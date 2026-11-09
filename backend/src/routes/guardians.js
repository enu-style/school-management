const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
const RELATIONS = ["father", "mother", "guardian", "other"];
const isId = (v) => /^\d+$/.test(String(v));

router.use(authenticate, authorize("admin"));

const checkId = (req, res, next, v) =>
  isId(v) ? next() : res.status(400).json({ error: "Invalid id" });
router.param("id", checkId);
router.param("studentId", checkId);

// All parents with their children
router.get("/", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT g.id, g.full_name, g.phone, u.email,
              COALESCE(json_agg(json_build_object('id', s.id, 'full_name', s.full_name, 'relationship', sg.relationship))
                       FILTER (WHERE s.id IS NOT NULL), '[]') AS children
       FROM guardians g
       LEFT JOIN users u ON u.id = g.user_id
       LEFT JOIN student_guardians sg ON sg.guardian_id = g.id
       LEFT JOIN students s ON s.id = sg.student_id
       GROUP BY g.id, u.email
       ORDER BY g.full_name`,
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create a parent: login account and profile together
router.post("/", async (req, res) => {
  const { email, password, full_name, phone } = req.body;
  if (!email || !password || !full_name) {
    return res
      .status(400)
      .json({ error: "email, password and full_name are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hash = await bcrypt.hash(password, 10);
    const user = await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'parent') RETURNING id",
      [email, hash],
    );
    const guardian = await client.query(
      "INSERT INTO guardians (user_id, full_name, phone) VALUES ($1, $2, $3) RETURNING *",
      [user.rows[0].id, full_name, phone || null],
    );
    await client.query("COMMIT");
    res.status(201).json(guardian.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505")
      return res.status(400).json({ error: "Email already registered" });
    if (err.code === "23514")
      return res
        .status(500)
        .json({
          error:
            "The database does not allow the parent role yet. Run the role SQL.",
        });
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const { full_name, phone } = req.body;
  if (!full_name)
    return res.status(400).json({ error: "full_name is required" });
  try {
    const r = await pool.query(
      "UPDATE guardians SET full_name = $1, phone = $2 WHERE id = $3 RETURNING *",
      [full_name, phone || null, req.params.id],
    );
    if (r.rows.length === 0)
      return res.status(404).json({ error: "Parent not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Deleting a parent removes their login and the links, never the students
router.delete("/:id", async (req, res) => {
  try {
    const g = await pool.query("SELECT user_id FROM guardians WHERE id = $1", [
      req.params.id,
    ]);
    if (g.rows.length === 0)
      return res.status(404).json({ error: "Parent not found" });
    await pool.query("DELETE FROM users WHERE id = $1", [g.rows[0].user_id]);
    res.json({ message: "Parent deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Link a student (or change the relationship)
router.post("/:id/children", async (req, res) => {
  const { student_id, relationship } = req.body;
  if (!isId(student_id) || !RELATIONS.includes(relationship)) {
    return res
      .status(400)
      .json({ error: "Choose a student and a relationship" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO student_guardians (student_id, guardian_id, relationship)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship
       RETURNING *`,
      [student_id, req.params.id, relationship],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23503")
      return res.status(404).json({ error: "Parent or student not found" });
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id/children/:studentId", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM student_guardians WHERE guardian_id = $1 AND student_id = $2",
      [req.params.id, req.params.studentId],
    );
    res.json({ message: "Link removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
