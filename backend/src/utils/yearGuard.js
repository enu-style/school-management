const pool = require("../config/db");

// True when the class belongs to a closed academic year
async function classYearClosed(classId) {
  const r = await pool.query(
    `SELECT y.status FROM classes c
     JOIN academic_years y ON y.id = c.academic_year_id
     WHERE c.id = $1`,
    [classId],
  );
  return r.rows[0]?.status === "closed";
}

module.exports = { classYearClosed };
