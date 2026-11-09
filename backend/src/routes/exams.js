const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

async function activeYearId() {
  const r = await pool.query(
    "SELECT id FROM academic_years WHERE status = 'active'",
  );
  return r.rows[0]?.id || null;
}

// Year of the request: year_id, else the year of class_id, else the active year
async function resolveYear(query) {
  if (query.year_id) return Number(query.year_id);
  if (query.class_id) {
    const c = await pool.query(
      "SELECT academic_year_id FROM classes WHERE id = $1",
      [query.class_id],
    );
    if (c.rows[0]?.academic_year_id) return c.rows[0].academic_year_id;
  }
  return activeYearId();
}

router.get(
  "/",
  authenticate,
  authorize("admin", "teacher"),
  async (req, res) => {
    try {
      const yearId = await resolveYear(req.query);
      const result = await pool.query(
        `SELECT id, name, term, max_score::float AS max_score, academic_year_id
       FROM exams WHERE academic_year_id = $1::int ORDER BY term, id`,
        [yearId],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post("/", authenticate, authorize("admin"), async (req, res) => {
  const { name, term, max_score } = req.body;
  if (!name || !term || !max_score) {
    return res
      .status(400)
      .json({ error: "name, term and max_score are required" });
  }
  if (Number(max_score) <= 0 || Number(max_score) > 100) {
    return res
      .status(400)
      .json({ error: "max_score must be between 1 and 100" });
  }
  try {
    const yearId = await activeYearId();
    if (!yearId)
      return res
        .status(400)
        .json({ error: "There is no active academic year" });
    const result = await pool.query(
      "INSERT INTO exams (name, term, max_score, academic_year_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, term, Number(max_score), yearId],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  try {
    const y = await pool.query(
      `SELECT y.status FROM exams e JOIN academic_years y ON y.id = e.academic_year_id WHERE e.id = $1`,
      [req.params.id],
    );
    if (y.rows[0]?.status === "closed") {
      return res
        .status(403)
        .json({
          error: "This academic year is closed. Records are read-only.",
        });
    }
    await pool.query("DELETE FROM exams WHERE id = $1", [req.params.id]);
    res.json({ message: "Assessment deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
