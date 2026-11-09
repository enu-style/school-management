const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

async function activeYear() {
  const r = await pool.query(
    "SELECT id, name FROM academic_years WHERE status = 'active'",
  );
  return r.rows[0] || null;
}

// Classes of one year (default: the active year)
router.get(
  "/",
  authenticate,
  authorize("admin", "teacher"),
  async (req, res) => {
    try {
      const yearId = req.query.year_id || (await activeYear())?.id || null;
      const result = await pool.query(
        `SELECT * FROM classes WHERE academic_year_id = $1::int
       ORDER BY CAST(SUBSTRING(name FROM '[0-9]+') AS INT), section`,
        [yearId],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Create a class in the active year (admin only)
router.post("/", authenticate, authorize("admin"), async (req, res) => {
  const { name, section } = req.body;
  if (!name || !section)
    return res.status(400).json({ error: "name and section are required" });
  try {
    const year = await activeYear();
    if (!year)
      return res
        .status(400)
        .json({ error: "There is no active academic year" });
    const result = await pool.query(
      "INSERT INTO classes (name, section, academic_year, academic_year_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, section, year.name, year.id],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505")
      return res.status(400).json({ error: "Class already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
