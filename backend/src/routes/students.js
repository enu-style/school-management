const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// Get all students (admin and teacher), with optional search: /api/students?search=abel
router.get(
  "/",
  authenticate,
  authorize("admin", "teacher"),
  async (req, res) => {
    const search = req.query.search || "";

    try {
      const result = await pool.query(
        `SELECT s.id, s.class_id, s.full_name, s.gender, to_char(s.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              c.name AS class_name, c.section, u.email
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.full_name ILIKE $1
       ORDER BY s.full_name`,
        [`%${search}%`],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Add a student (admin only): creates the login account and the student profile together
router.post("/", authenticate, authorize("admin"), async (req, res) => {
  const { email, password, full_name, gender, date_of_birth, class_id } =
    req.body;

  if (!email || !password || !full_name) {
    return res
      .status(400)
      .json({ error: "email, password and full_name are required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'student') RETURNING id",
      [email, passwordHash],
    );

    const studentResult = await client.query(
      `INSERT INTO students (user_id, full_name, gender, date_of_birth, class_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userResult.rows[0].id, full_name, gender, date_of_birth, class_id],
    );

    await client.query("COMMIT");
    res.status(201).json(studentResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// Update a student (admin only)
router.put("/:id", authenticate, authorize("admin"), async (req, res) => {
  const { full_name, gender, date_of_birth, class_id } = req.body;

  try {
    const result = await pool.query(
      `UPDATE students
       SET full_name = $1, gender = $2, date_of_birth = $3, class_id = $4
       WHERE id = $5 RETURNING *`,
      [full_name, gender, date_of_birth, class_id, req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete a student (admin only): also deletes the login account
router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  try {
    const student = await pool.query(
      "SELECT user_id FROM students WHERE id = $1",
      [req.params.id],
    );

    if (student.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [
      student.rows[0].user_id,
    ]);
    res.json({ message: "Student deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
