const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);
const admin = authorize("admin");

const isId = (v) => /^\d+$/.test(String(v));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const toTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Stops a transaction with a message that is safe to show the user
function fail(message) {
  const err = new Error(message);
  err.user = true;
  throw err;
}

function handle(res, err) {
  if (err.user) return res.status(400).json({ error: err.message });
  if (err.code === "23505") {
    return res
      .status(400)
      .json({
        error:
          "That time slot was just taken by another change. Reload and try again.",
      });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
}

for (const name of ["id", "classId", "teacherId", "studentId"]) {
  router.param(name, (req, res, next, v) =>
    isId(v) ? next() : res.status(400).json({ error: "Invalid id" }),
  );
}

const PERIOD_SELECT = `
  SELECT id, name, to_char(start_time, 'HH24:MI') AS start_time,
         to_char(end_time, 'HH24:MI') AS end_time, is_break
  FROM timetable_periods ORDER BY start_time`;

const ENTRY_SELECT = `
  SELECT e.id, e.day, e.period_id, e.subject_id, e.classroom_id,
         sub.name AS subject, t.full_name AS teacher, r.name AS classroom,
         c.name AS class_name, c.section
  FROM timetable_entries e
  JOIN subjects sub ON sub.id = e.subject_id
  JOIN classes c ON c.id = e.class_id
  LEFT JOIN teachers t ON t.id = e.teacher_id
  LEFT JOIN classrooms r ON r.id = e.classroom_id`;

// ---------- grids ----------

async function classGrid(classId) {
  const c = await pool.query(
    `SELECT c.id, c.name, c.section, y.name AS year, y.status
     FROM classes c LEFT JOIN academic_years y ON y.id = c.academic_year_id
     WHERE c.id = $1::int`,
    [classId],
  );
  if (!c.rows[0]) return null;
  const k = c.rows[0];
  const entries = await pool.query(
    `${ENTRY_SELECT} WHERE e.class_id = $1::int ORDER BY e.day`,
    [classId],
  );
  return {
    title: `${k.name} - ${k.section} (${k.year || "no year"})`,
    closed: k.status === "closed",
    entries: entries.rows,
  };
}

async function studentGrid(studentId) {
  const s = await pool.query(
    "SELECT class_id FROM students WHERE id = $1::int",
    [studentId],
  );
  if (!s.rows[0]) return null;
  if (!s.rows[0].class_id)
    return { title: "No class yet", closed: false, entries: [] };
  return classGrid(s.rows[0].class_id);
}

async function teacherGrid(teacherId) {
  const t = await pool.query(
    "SELECT full_name FROM teachers WHERE id = $1::int",
    [teacherId],
  );
  if (!t.rows[0]) return null;
  const y = await pool.query(
    "SELECT id, name FROM academic_years WHERE status = 'active'",
  );
  if (!y.rows[0])
    return {
      title: `${t.rows[0].full_name} (no active year)`,
      closed: false,
      entries: [],
    };
  const entries = await pool.query(
    `${ENTRY_SELECT} WHERE e.teacher_id = $1::int AND e.academic_year_id = $2::int ORDER BY e.day`,
    [teacherId, y.rows[0].id],
  );
  return {
    title: `${t.rows[0].full_name} (${y.rows[0].name})`,
    closed: false,
    entries: entries.rows,
  };
}

router.get("/periods", async (req, res) => {
  try {
    res.json((await pool.query(PERIOD_SELECT)).rows);
  } catch (err) {
    handle(res, err);
  }
});

router.get(
  "/class/:classId",
  authorize("admin", "teacher"),
  async (req, res) => {
    try {
      const grid = await classGrid(req.params.classId);
      if (!grid) return res.status(404).json({ error: "Class not found" });
      res.json(grid);
    } catch (err) {
      handle(res, err);
    }
  },
);

// Subjects (with their teacher) and rooms the admin can pick from
router.get("/class/:classId/options", admin, async (req, res) => {
  try {
    const subjects = await pool.query(
      `SELECT s.id, s.name, t.full_name AS teacher
       FROM class_subjects cs
       JOIN subjects s ON s.id = cs.subject_id
       LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = $1::int ORDER BY s.name`,
      [req.params.classId],
    );
    const rooms = await pool.query(
      "SELECT id, name, capacity FROM classrooms WHERE active ORDER BY name",
    );
    res.json({ subjects: subjects.rows, classrooms: rooms.rows });
  } catch (err) {
    handle(res, err);
  }
});

router.get("/teacher/:teacherId", admin, async (req, res) => {
  try {
    const grid = await teacherGrid(req.params.teacherId);
    if (!grid) return res.status(404).json({ error: "Teacher not found" });
    res.json(grid);
  } catch (err) {
    handle(res, err);
  }
});

router.get("/my", authorize("teacher"), async (req, res) => {
  try {
    const t = await pool.query("SELECT id FROM teachers WHERE user_id = $1", [
      req.user.id,
    ]);
    if (!t.rows[0])
      return res.status(404).json({ error: "Teacher profile not found" });
    res.json(await teacherGrid(t.rows[0].id));
  } catch (err) {
    handle(res, err);
  }
});

router.get("/me", authorize("student"), async (req, res) => {
  try {
    const s = await pool.query("SELECT id FROM students WHERE user_id = $1", [
      req.user.id,
    ]);
    if (!s.rows[0])
      return res.status(404).json({ error: "Student profile not found" });
    res.json(await studentGrid(s.rows[0].id));
  } catch (err) {
    handle(res, err);
  }
});

// A parent sees only linked children
router.get(
  "/for-student/:studentId",
  authorize("admin", "parent"),
  async (req, res) => {
    try {
      if (req.user.role === "parent") {
        const ok = await pool.query(
          `SELECT 1 FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
         WHERE g.user_id = $1 AND sg.student_id = $2::int`,
          [req.user.id, req.params.studentId],
        );
        if (ok.rows.length === 0)
          return res
            .status(403)
            .json({ error: "This student is not linked to your account" });
      }
      const grid = await studentGrid(req.params.studentId);
      if (!grid) return res.status(404).json({ error: "Student not found" });
      res.json(grid);
    } catch (err) {
      handle(res, err);
    }
  },
);

// ---------- lessons (with conflict checks) ----------

router.post("/entries", admin, async (req, res) => {
  const { class_id, day, period_id, subject_id } = req.body;
  const classroomId = req.body.classroom_id || null;
  const d = Number(day);
  if (
    !isId(class_id) ||
    !isId(period_id) ||
    !isId(subject_id) ||
    !Number.isInteger(d) ||
    d < 1 ||
    d > 6 ||
    (classroomId && !isId(classroomId))
  ) {
    return res
      .status(400)
      .json({ error: "Choose a day, a period, and a subject" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const c = await client.query(
      `SELECT c.academic_year_id, c.name, c.section, y.status
       FROM classes c JOIN academic_years y ON y.id = c.academic_year_id
       WHERE c.id = $1::int`,
      [class_id],
    );
    if (!c.rows[0]) fail("Class not found");
    const klass = c.rows[0];
    if (klass.status === "closed")
      fail("This academic year is closed. The timetable is read-only.");

    // One timetable change per year at a time, so the checks below cannot race
    await client.query("SELECT pg_advisory_xact_lock(7001, $1::int)", [
      klass.academic_year_id,
    ]);

    const p = await client.query(
      "SELECT is_break FROM timetable_periods WHERE id = $1::int",
      [period_id],
    );
    if (!p.rows[0]) fail("Period not found");
    if (p.rows[0].is_break) fail("Lessons cannot be scheduled during a break");

    const a = await client.query(
      `SELECT cs.teacher_id, t.full_name AS teacher
       FROM class_subjects cs LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = $1::int AND cs.subject_id = $2::int`,
      [class_id, subject_id],
    );
    if (!a.rows[0])
      fail(
        "This subject is not assigned to the class. Add it in Assignments first.",
      );
    if (!a.rows[0].teacher_id)
      fail(
        "No teacher is assigned to this subject. Assign one in Assignments first.",
      );
    const teacherId = a.rows[0].teacher_id;

    const busyTeacher = await client.query(
      `SELECT c.name, c.section FROM timetable_entries e JOIN classes c ON c.id = e.class_id
       WHERE e.academic_year_id = $1::int AND e.teacher_id = $2::int AND e.day = $3
         AND e.period_id = $4::int AND e.class_id <> $5::int LIMIT 1`,
      [klass.academic_year_id, teacherId, d, period_id, class_id],
    );
    if (busyTeacher.rows[0]) {
      fail(
        `${a.rows[0].teacher} already teaches ${busyTeacher.rows[0].name} - ${busyTeacher.rows[0].section} at that time`,
      );
    }

    if (classroomId) {
      const r = await client.query(
        "SELECT name, capacity, active FROM classrooms WHERE id = $1::int",
        [classroomId],
      );
      const room = r.rows[0];
      if (!room || !room.active) fail("Choose an active classroom");
      if (room.capacity) {
        const n = await client.query(
          "SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1::int AND status = 'active'",
          [class_id],
        );
        if (n.rows[0].n > room.capacity) {
          fail(
            `${room.name} holds ${room.capacity} students, but ${klass.name} - ${klass.section} has ${n.rows[0].n}`,
          );
        }
      }
      const busyRoom = await client.query(
        `SELECT c.name, c.section FROM timetable_entries e JOIN classes c ON c.id = e.class_id
         WHERE e.academic_year_id = $1::int AND e.classroom_id = $2::int AND e.day = $3
           AND e.period_id = $4::int AND e.class_id <> $5::int LIMIT 1`,
        [klass.academic_year_id, classroomId, d, period_id, class_id],
      );
      if (busyRoom.rows[0]) {
        fail(
          `${room.name} is already used by ${busyRoom.rows[0].name} - ${busyRoom.rows[0].section} at that time`,
        );
      }
    }

    const saved = await client.query(
      `INSERT INTO timetable_entries (academic_year_id, class_id, subject_id, teacher_id, classroom_id, day, period_id)
       VALUES ($1::int, $2::int, $3::int, $4::int, $5::int, $6, $7::int)
       ON CONFLICT (class_id, day, period_id)
       DO UPDATE SET subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id,
                     classroom_id = EXCLUDED.classroom_id
       RETURNING id`,
      [
        klass.academic_year_id,
        class_id,
        subject_id,
        teacherId,
        classroomId,
        d,
        period_id,
      ],
    );
    await client.query("COMMIT");
    res.status(201).json(saved.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

router.delete("/entries/:id", admin, async (req, res) => {
  try {
    const e = await pool.query(
      `SELECT y.status FROM timetable_entries e JOIN academic_years y ON y.id = e.academic_year_id
       WHERE e.id = $1::int`,
      [req.params.id],
    );
    if (!e.rows[0]) return res.status(404).json({ error: "Lesson not found" });
    if (e.rows[0].status === "closed") {
      return res
        .status(400)
        .json({
          error: "This academic year is closed. The timetable is read-only.",
        });
    }
    await pool.query("DELETE FROM timetable_entries WHERE id = $1::int", [
      req.params.id,
    ]);
    res.json({ message: "Lesson removed" });
  } catch (err) {
    handle(res, err);
  }
});

// ---------- periods (the school day) ----------

function readPeriod(body) {
  const name = String(body.name || "").trim();
  if (!name || name.length > 50)
    return { error: "Enter a name (up to 50 characters)" };
  if (!TIME.test(body.start_time || "") || !TIME.test(body.end_time || ""))
    return { error: "Enter valid start and end times" };
  if (body.end_time <= body.start_time)
    return { error: "The end must be after the start" };
  return {
    value: {
      name,
      start: body.start_time,
      end: body.end_time,
      brk: body.is_break === true,
    },
  };
}

async function overlaps(client, start, end, ignoreId) {
  const r = await client.query(
    `SELECT name FROM timetable_periods
     WHERE id <> $3::int AND start_time < $2::time AND end_time > $1::time LIMIT 1`,
    [start, end, ignoreId || 0],
  );
  return r.rows[0]?.name || null;
}

router.post("/periods", admin, async (req, res) => {
  const p = readPeriod(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  const client = await pool.connect();
  try {
    const clash = await overlaps(client, p.value.start, p.value.end, 0);
    if (clash)
      return res.status(400).json({ error: `This overlaps with ${clash}` });
    const r = await client.query(
      "INSERT INTO timetable_periods (name, start_time, end_time, is_break) VALUES ($1, $2, $3, $4) RETURNING id",
      [p.value.name, p.value.start, p.value.end, p.value.brk],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res
        .status(400)
        .json({ error: "A period already starts at that time" });
    handle(res, err);
  } finally {
    client.release();
  }
});

router.put("/periods/:id", admin, async (req, res) => {
  const p = readPeriod(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  const client = await pool.connect();
  try {
    const clash = await overlaps(
      client,
      p.value.start,
      p.value.end,
      req.params.id,
    );
    if (clash)
      return res.status(400).json({ error: `This overlaps with ${clash}` });
    if (p.value.brk) {
      const used = await client.query(
        "SELECT 1 FROM timetable_entries WHERE period_id = $1::int LIMIT 1",
        [req.params.id],
      );
      if (used.rows[0])
        return res
          .status(400)
          .json({
            error:
              "This period has lessons. Remove them before making it a break.",
          });
    }
    const r = await client.query(
      "UPDATE timetable_periods SET name = $1, start_time = $2, end_time = $3, is_break = $4 WHERE id = $5::int RETURNING id",
      [p.value.name, p.value.start, p.value.end, p.value.brk, req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Period not found" });
    res.json({ message: "Period updated" });
  } catch (err) {
    if (err.code === "23505")
      return res
        .status(400)
        .json({ error: "A period already starts at that time" });
    handle(res, err);
  } finally {
    client.release();
  }
});

router.delete("/periods/:id", admin, async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM timetable_periods WHERE id = $1::int RETURNING id",
      [req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Period not found" });
    res.json({ message: "Period deleted" });
  } catch (err) {
    if (err.code === "23503")
      return res
        .status(400)
        .json({ error: "This period has lessons. Remove them first." });
    handle(res, err);
  }
});

// Build the whole school day from a start time, lesson length, and breaks
router.post("/periods/generate", admin, async (req, res) => {
  const { start_time, lesson_minutes, lessons, breaks } = req.body;
  const lm = Number(lesson_minutes);
  const n = Number(lessons);
  if (!TIME.test(start_time || ""))
    return res.status(400).json({ error: "Enter a valid start time" });
  if (!Number.isInteger(lm) || lm < 20 || lm > 120)
    return res
      .status(400)
      .json({ error: "A lesson must be 20 to 120 minutes" });
  if (!Number.isInteger(n) || n < 1 || n > 12)
    return res.status(400).json({ error: "Use 1 to 12 lessons" });
  const list = Array.isArray(breaks) ? breaks : [];
  if (list.length > 6)
    return res.status(400).json({ error: "Use at most 6 breaks" });

  const gaps = {};
  for (const b of list) {
    const after = Number(b.after);
    const minutes = Number(b.minutes);
    if (
      !Number.isInteger(after) ||
      after < 1 ||
      after >= n ||
      !Number.isInteger(minutes) ||
      minutes < 5 ||
      minutes > 90 ||
      gaps[after]
    ) {
      return res
        .status(400)
        .json({
          error:
            "Each break needs a lesson number (before the last lesson), 5 to 90 minutes, and no two breaks in the same place",
        });
    }
    gaps[after] = minutes;
  }

  let t = toMin(start_time);
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push({ name: `Period ${i}`, start: t, end: t + lm, brk: false });
    t += lm;
    if (gaps[i]) {
      rows.push({ name: "Break", start: t, end: t + gaps[i], brk: true });
      t += gaps[i];
    }
  }
  if (t > 23 * 60 + 59)
    return res
      .status(400)
      .json({ error: "The school day would run past midnight" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const used = await client.query("SELECT 1 FROM timetable_entries LIMIT 1");
    if (used.rows[0])
      fail(
        "Lessons already exist. Remove them before rebuilding the school day.",
      );
    await client.query("DELETE FROM timetable_periods");
    for (const r of rows) {
      await client.query(
        "INSERT INTO timetable_periods (name, start_time, end_time, is_break) VALUES ($1, $2, $3, $4)",
        [r.name, toTime(r.start), toTime(r.end), r.brk],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ created: rows.length });
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// ---------- classrooms ----------

function readRoom(body) {
  const name = String(body.name || "").trim();
  if (!name || name.length > 50)
    return { error: "Enter a name (up to 50 characters)" };
  const raw = body.capacity;
  let capacity = null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
    capacity = Number(raw);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
      return { error: "Capacity must be a whole number from 1 to 500" };
  }
  return { value: { name, capacity, active: body.active !== false } };
}

router.get("/classrooms", admin, async (req, res) => {
  try {
    res.json(
      (
        await pool.query(
          "SELECT id, name, capacity, active FROM classrooms ORDER BY name",
        )
      ).rows,
    );
  } catch (err) {
    handle(res, err);
  }
});

router.post("/classrooms", admin, async (req, res) => {
  const r = readRoom(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  try {
    const q = await pool.query(
      "INSERT INTO classrooms (name, capacity, active) VALUES ($1, $2, $3) RETURNING id",
      [r.value.name, r.value.capacity, r.value.active],
    );
    res.status(201).json(q.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res
        .status(400)
        .json({ error: "A classroom with that name already exists" });
    handle(res, err);
  }
});

router.put("/classrooms/:id", admin, async (req, res) => {
  const r = readRoom(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  try {
    const q = await pool.query(
      "UPDATE classrooms SET name = $1, capacity = $2, active = $3 WHERE id = $4::int RETURNING id",
      [r.value.name, r.value.capacity, r.value.active, req.params.id],
    );
    if (!q.rows[0])
      return res.status(404).json({ error: "Classroom not found" });
    res.json({ message: "Classroom updated" });
  } catch (err) {
    if (err.code === "23505")
      return res
        .status(400)
        .json({ error: "A classroom with that name already exists" });
    handle(res, err);
  }
});

router.delete("/classrooms/:id", admin, async (req, res) => {
  try {
    const q = await pool.query(
      "DELETE FROM classrooms WHERE id = $1::int RETURNING id",
      [req.params.id],
    );
    if (!q.rows[0])
      return res.status(404).json({ error: "Classroom not found" });
    res.json({ message: "Classroom deleted" });
  } catch (err) {
    if (err.code === "23503")
      return res
        .status(400)
        .json({
          error:
            "This classroom is used in the timetable. Deactivate it instead.",
        });
    handle(res, err);
  }
});

module.exports = router;
