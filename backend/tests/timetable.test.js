import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  bearer,
  pool,
  resetDb,
  createUser,
  createYear,
  createClass,
  createSubject,
  createTeacher,
  createStudent,
  assign,
  tokenFor,
} from "./helpers.js";

let year, c9a, c9b, c10a, math, english, physics, chem;
let T1, T2, T3, S1, S2, S3, S4;
let adminToken, teacherToken, student1Token, parentToken, strangerToken;
let P = {};
let R1, R2, Lab, Old;
let e1, e2;

beforeAll(async () => {
  await resetDb();
  year = await createYear();
  c9a = await createClass(year, "Grade 9", "A");
  c9b = await createClass(year, "Grade 9", "B");
  c10a = await createClass(year, "Grade 10", "A");
  math = await createSubject("Math");
  english = await createSubject("English");
  physics = await createSubject("Physics");
  chem = await createSubject("Chemistry");
  T1 = await createTeacher("t1@test.com", "Teacher One");
  T2 = await createTeacher("t2@test.com", "Teacher Two");
  T3 = await createTeacher("t3@test.com", "Teacher Three");
  await assign(c9a, math, T1.id);
  await assign(c9b, math, T1.id);
  await assign(c9b, english, T2.id);
  await assign(c9a, physics, T2.id);
  await assign(c9a, chem, null);
  await assign(c10a, math, T1.id);
  await assign(c10a, physics, T3.id);
  await assign(c10a, english, T2.id);
  S1 = await createStudent("Abel A", "s1@test.com", c9a);
  S2 = await createStudent("Selam B", "s2@test.com", c9a);
  S3 = await createStudent("Dawit C", "s3@test.com", c9a);
  S4 = await createStudent("Eden D", "s4@test.com", c9b);
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(T1.user);
  student1Token = tokenFor(S1.user);

  const parent = await createUser("parent", "p@test.com");
  const g = await pool.query(
    "INSERT INTO guardians (user_id, full_name) VALUES ($1, 'Parent One') RETURNING id",
    [parent.id],
  );
  await pool.query(
    "INSERT INTO student_guardians (student_id, guardian_id, relationship) VALUES ($1, $2, 'father')",
    [S1.id, g.rows[0].id],
  );
  parentToken = tokenFor(parent);
  const stranger = await createUser("parent", "stranger@test.com");
  const g2 = await pool.query(
    "INSERT INTO guardians (user_id, full_name) VALUES ($1, 'Stranger') RETURNING id",
    [stranger.id],
  );
  await pool.query(
    "INSERT INTO student_guardians (student_id, guardian_id, relationship) VALUES ($1, $2, 'father')",
    [S4.id, g2.rows[0].id],
  );
  strangerToken = tokenFor(stranger);
});
afterAll(() => pool.end());

const call = (token, method, url, body) => {
  const r = api()[method](url).set(bearer(token));
  return body === undefined ? r : r.send(body);
};
const put = (data, token = adminToken) =>
  call(token, "post", "/api/timetable/entries", data);
const slot = (classId, day, period, subject, room = null) => ({
  class_id: classId,
  day,
  period_id: period,
  subject_id: subject,
  classroom_id: room,
});
const periods = async () =>
  (await call(adminToken, "get", "/api/timetable/periods")).body;
const gridOf = async (classId) =>
  (await call(adminToken, "get", `/api/timetable/class/${classId}`)).body;

describe("the school day", () => {
  const generate = (body, token = adminToken) =>
    call(token, "post", "/api/timetable/periods/generate", body);
  const good = {
    start_time: "08:00",
    lesson_minutes: 40,
    lessons: 4,
    breaks: [{ after: 2, minutes: 20 }],
  };

  async function loadPeriods() {
    const list = await periods();
    P = {
      p1: list[0].id,
      p2: list[1].id,
      brk: list[2].id,
      p3: list[3].id,
      p4: list[4].id,
    };
    return list;
  }

  it.each([
    ["a start time without two digits", { start_time: "8:00" }],
    ["a lesson shorter than 20 minutes", { lesson_minutes: 10 }],
    ["no lessons", { lessons: 0 }],
    ["a break after the last lesson", { breaks: [{ after: 4, minutes: 20 }] }],
    [
      "two breaks in the same place",
      {
        breaks: [
          { after: 2, minutes: 10 },
          { after: 2, minutes: 10 },
        ],
      },
    ],
    [
      "a day that runs past midnight",
      { start_time: "23:00", lessons: 12, lesson_minutes: 120, breaks: [] },
    ],
  ])("rejects %s", async (_label, change) => {
    expect((await generate({ ...good, ...change })).status).toBe(400);
  });

  it("is admin only", async () => {
    expect((await generate(good, teacherToken)).status).toBe(403);
  });

  it("builds the periods with the break in the right place", async () => {
    const res = await generate(good);
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(5);
    const list = await loadPeriods();
    expect(
      list.map((p) => [p.name, p.start_time, p.end_time, p.is_break]),
    ).toEqual([
      ["Period 1", "08:00", "08:40", false],
      ["Period 2", "08:40", "09:20", false],
      ["Break", "09:20", "09:40", true],
      ["Period 3", "09:40", "10:20", false],
      ["Period 4", "10:20", "11:00", false],
    ]);
  });

  it("can be rebuilt while no lessons exist", async () => {
    expect((await generate(good)).status).toBe(201);
    const list = await loadPeriods();
    expect(list).toHaveLength(5);
  });

  it("refuses a period that overlaps another, or ends before it starts", async () => {
    const overlap = await call(adminToken, "post", "/api/timetable/periods", {
      name: "Extra",
      start_time: "08:30",
      end_time: "09:00",
    });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error).toMatch(/overlaps/);
    const backwards = await call(adminToken, "post", "/api/timetable/periods", {
      name: "Odd",
      start_time: "15:00",
      end_time: "14:00",
    });
    expect(backwards.status).toBe(400);
  });

  it("adds, renames, and deletes a period", async () => {
    const created = await call(adminToken, "post", "/api/timetable/periods", {
      name: "Club",
      start_time: "15:00",
      end_time: "15:40",
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const renamed = await call(
      adminToken,
      "put",
      `/api/timetable/periods/${id}`,
      {
        name: "Club hour",
        start_time: "15:00",
        end_time: "15:40",
        is_break: false,
      },
    );
    expect(renamed.status).toBe(200);
    expect((await periods()).find((p) => p.id === id).name).toBe("Club hour");
    expect(
      (await call(adminToken, "delete", `/api/timetable/periods/${id}`)).status,
    ).toBe(200);
    expect(
      (await call(adminToken, "delete", "/api/timetable/periods/999999"))
        .status,
    ).toBe(404);
  });
});

describe("classrooms", () => {
  const room = (name, capacity) =>
    call(adminToken, "post", "/api/timetable/classrooms", { name, capacity });

  it("creates classrooms with or without a capacity", async () => {
    const a = await room("Room 101", 40);
    R1 = a.body.id;
    R2 = (await room("Room 102", 40)).body.id;
    Lab = (await room("Lab", 2)).body.id;
    Old = (await room("Old Room", 30)).body.id;
    expect(a.status).toBe(201);
    const noCapacity = await room("Hall", "");
    expect(noCapacity.status).toBe(201);
    const list = await call(adminToken, "get", "/api/timetable/classrooms");
    expect(list.body.find((r) => r.name === "Hall").capacity).toBeNull();
  });

  it("refuses a duplicate name and a bad capacity", async () => {
    expect((await room("Room 101", 40)).status).toBe(400);
    expect((await room("Bad 1", 0)).status).toBe(400);
    expect((await room("Bad 2", "abc")).status).toBe(400);
    expect((await room("", 10)).status).toBe(400);
  });

  it("deactivates a room", async () => {
    const res = await call(
      adminToken,
      "put",
      `/api/timetable/classrooms/${Old}`,
      { name: "Old Room", capacity: 30, active: false },
    );
    expect(res.status).toBe(200);
  });

  it("is admin only", async () => {
    expect(
      (
        await call(teacherToken, "post", "/api/timetable/classrooms", {
          name: "Nope",
          capacity: 1,
        })
      ).status,
    ).toBe(403);
  });
});

describe("scheduling lessons", () => {
  it("schedules a lesson with its teacher and room", async () => {
    const res = await put(slot(c9a, 1, P.p1, math, R1));
    expect(res.status).toBe(201);
    e1 = res.body.id;
    const grid = await gridOf(c9a);
    expect(grid.title).toBe("Grade 9 - A (2026/2027)");
    expect(grid.entries).toEqual([
      expect.objectContaining({
        day: 1,
        period_id: P.p1,
        subject: "Math",
        teacher: "Teacher One",
        classroom: "Room 101",
      }),
    ]);
  });

  it("refuses a teacher who is teaching another class at that time", async () => {
    const res = await put(slot(c9b, 1, P.p1, math));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Teacher One already teaches Grade 9 - A/);
  });

  it("refuses a classroom that is in use, and accepts a free one", async () => {
    const clash = await put(slot(c9b, 1, P.p1, english, R1));
    expect(clash.status).toBe(400);
    expect(clash.body.error).toMatch(/Room 101 is already used by Grade 9 - A/);
    const ok = await put(slot(c9b, 1, P.p1, english, R2));
    expect(ok.status).toBe(201);
    e2 = ok.body.id;
  });

  it("replaces the lesson when the same slot is set again", async () => {
    expect((await put(slot(c9a, 2, P.p1, physics))).status).toBe(201);
    expect((await put(slot(c9a, 2, P.p1, math))).status).toBe(201);
    const tuesday = (await gridOf(c9a)).entries.filter((e) => e.day === 2);
    expect(tuesday).toHaveLength(1);
    expect(tuesday[0].subject).toBe("Math");
  });

  it("refuses a break period", async () => {
    const res = await put(slot(c9a, 1, P.brk, math));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/break/);
  });

  it("refuses a subject that is not assigned to the class", async () => {
    const res = await put(slot(c9b, 3, P.p2, physics));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not assigned/);
  });

  it("refuses a subject that has no teacher", async () => {
    const res = await put(slot(c9a, 3, P.p2, chem));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No teacher/);
  });

  it("refuses a room that is too small for the class", async () => {
    const res = await put(slot(c9a, 4, P.p2, math, Lab));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/holds 2/);
  });

  it("refuses an inactive room", async () => {
    const res = await put(slot(c9a, 4, P.p2, math, Old));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/active classroom/);
  });

  it("refuses invalid input", async () => {
    const bad = [
      slot(c9a, 7, P.p1, math),
      slot(c9a, 0, P.p1, math),
      { class_id: c9a, day: 1, period_id: P.p1 },
      slot("x", 1, P.p1, math),
    ];
    for (const body of bad)
      expect((await put(body)).status, JSON.stringify(body)).toBe(400);
  });

  it("refuses an unknown period or class", async () => {
    expect((await put(slot(c9a, 1, 999999, math))).body.error).toMatch(
      /Period not found/,
    );
    expect((await put(slot(999999, 1, P.p1, math))).body.error).toMatch(
      /Class not found/,
    );
  });

  it("is admin only", async () => {
    expect((await put(slot(c9a, 5, P.p1, math), teacherToken)).status).toBe(
      403,
    );
    expect((await put(slot(c9a, 5, P.p1, math), student1Token)).status).toBe(
      403,
    );
    expect((await put(slot(c9a, 5, P.p1, math), parentToken)).status).toBe(403);
  });
});

describe("who sees which timetable", () => {
  it("shows a class to staff, with teacher, room, and subject", async () => {
    const asTeacher = await call(
      teacherToken,
      "get",
      `/api/timetable/class/${c9a}`,
    );
    expect(asTeacher.status).toBe(200);
    expect(asTeacher.body.entries).toHaveLength(2);
    expect(
      (await call(student1Token, "get", `/api/timetable/class/${c9a}`)).status,
    ).toBe(403);
  });

  it("shows a teacher their own lessons across classes", async () => {
    const mine = await call(teacherToken, "get", "/api/timetable/my");
    expect(mine.status).toBe(200);
    expect(
      mine.body.entries.map((e) => `${e.class_name} ${e.section} ${e.subject}`),
    ).toEqual(["Grade 9 A Math", "Grade 9 A Math"]);
    const other = await call(tokenFor(T2.user), "get", "/api/timetable/my");
    expect(
      other.body.entries.map(
        (e) => `${e.class_name} ${e.section} ${e.subject}`,
      ),
    ).toEqual(["Grade 9 B English"]);
  });

  it("lets an admin open any teacher, and nobody else", async () => {
    const res = await call(
      adminToken,
      "get",
      `/api/timetable/teacher/${T1.id}`,
    );
    expect(res.body.entries).toHaveLength(2);
    expect(
      (await call(teacherToken, "get", `/api/timetable/teacher/${T2.id}`))
        .status,
    ).toBe(403);
    expect(
      (await call(adminToken, "get", "/api/timetable/teacher/999999")).status,
    ).toBe(404);
    expect((await call(adminToken, "get", "/api/timetable/my")).status).toBe(
      403,
    );
  });

  it("shows a student their own class", async () => {
    const res = await call(student1Token, "get", "/api/timetable/me");
    expect(res.status).toBe(200);
    expect(res.body.title).toContain("Grade 9 - A");
    expect(res.body.entries).toHaveLength(2);
  });

  it("shows a student without a class an empty timetable", async () => {
    const loner = await createStudent("No Class", "loner@test.com", null);
    const res = await call(tokenFor(loner.user), "get", "/api/timetable/me");
    expect(res.body).toEqual({
      title: "No class yet",
      closed: false,
      entries: [],
    });
  });

  it("shows a parent only the classes of their own children", async () => {
    expect(
      (await call(parentToken, "get", `/api/timetable/for-student/${S1.id}`))
        .status,
    ).toBe(200);
    expect(
      (await call(parentToken, "get", `/api/timetable/for-student/${S4.id}`))
        .status,
    ).toBe(403);
    expect(
      (await call(strangerToken, "get", `/api/timetable/for-student/${S1.id}`))
        .status,
    ).toBe(403);
    expect(
      (await call(adminToken, "get", `/api/timetable/for-student/${S4.id}`))
        .status,
    ).toBe(200);
    expect(
      (await call(teacherToken, "get", `/api/timetable/for-student/${S1.id}`))
        .status,
    ).toBe(403);
  });

  it("offers the subjects of a class with their teachers, and active rooms only", async () => {
    const res = await call(
      adminToken,
      "get",
      `/api/timetable/class/${c9a}/options`,
    );
    expect(res.body.subjects.map((s) => [s.name, s.teacher])).toEqual([
      ["Chemistry", null],
      ["Math", "Teacher One"],
      ["Physics", "Teacher Two"],
    ]);
    expect(res.body.classrooms.map((r) => r.name)).not.toContain("Old Room");
    expect(
      (await call(teacherToken, "get", `/api/timetable/class/${c9a}/options`))
        .status,
    ).toBe(403);
  });

  it("shows the periods to every logged-in role", async () => {
    for (const token of [
      adminToken,
      teacherToken,
      student1Token,
      parentToken,
    ]) {
      expect((await call(token, "get", "/api/timetable/periods")).status).toBe(
        200,
      );
    }
  });
});

describe("changing a teacher in Assignments", () => {
  const reassign = (classId, subjectId, teacherId) =>
    call(adminToken, "post", "/api/assignments", {
      class_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId,
    });

  it("refuses a new teacher who is busy at the same time", async () => {
    const res = await reassign(c9a, math, T2.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already has a lesson/);
    const row = await pool.query(
      "SELECT teacher_id FROM class_subjects WHERE class_id = $1 AND subject_id = $2",
      [c9a, math],
    );
    expect(row.rows[0].teacher_id).toBe(T1.id);
  });

  it("moves the lessons to a free teacher", async () => {
    expect((await reassign(c9a, math, T3.id)).status).toBe(201);
    const rows = await pool.query(
      "SELECT DISTINCT teacher_id FROM timetable_entries WHERE class_id = $1 AND subject_id = $2",
      [c9a, math],
    );
    expect(rows.rows).toEqual([{ teacher_id: T3.id }]);
    const grid = await gridOf(c9a);
    expect(grid.entries.every((e) => e.teacher === "Teacher Three")).toBe(true);
  });

  it("removes the lessons when the assignment is removed", async () => {
    expect((await put(slot(c10a, 4, P.p1, english))).status).toBe(201);
    const assignment = await pool.query(
      "SELECT id FROM class_subjects WHERE class_id = $1 AND subject_id = $2",
      [c10a, english],
    );
    expect(
      (
        await call(
          adminToken,
          "delete",
          `/api/assignments/${assignment.rows[0].id}`,
        )
      ).status,
    ).toBe(200);
    const left = await pool.query(
      "SELECT COUNT(*)::int AS n FROM timetable_entries WHERE class_id = $1 AND subject_id = $2",
      [c10a, english],
    );
    expect(left.rows[0].n).toBe(0);
  });
});

describe("two changes at the same moment", () => {
  it("book the same teacher only once", async () => {
    const results = await Promise.all([
      put(slot(c9b, 3, P.p1, math)),
      put(slot(c10a, 3, P.p1, math)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const booked = await pool.query(
      "SELECT COUNT(*)::int AS n FROM timetable_entries WHERE teacher_id = $1 AND day = 3 AND period_id = $2",
      [T1.id, P.p1],
    );
    expect(booked.rows[0].n).toBe(1);
  });
});

describe("the database as a safety net", () => {
  const raw = (classId, subjectId, teacherId, roomId, day, period) =>
    pool.query(
      `INSERT INTO timetable_entries (academic_year_id, class_id, subject_id, teacher_id, classroom_id, day, period_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [year.id, classId, subjectId, teacherId, roomId, day, period],
    );

  it("refuses a teacher in two places even when the API check is skipped", async () => {
    await expect(raw(c9a, math, T1.id, null, 3, P.p1)).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("refuses a classroom used twice at the same time", async () => {
    expect((await put(slot(c9a, 3, P.p2, math, R1))).status).toBe(201);
    await expect(raw(c9b, english, T2.id, R1, 3, P.p2)).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("refuses two lessons for one class in the same slot", async () => {
    await expect(raw(c9a, math, T3.id, null, 3, P.p2)).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("refuses a subject that is not assigned to the class", async () => {
    await expect(raw(c9b, physics, T2.id, null, 5, P.p1)).rejects.toThrow(
      /foreign key/,
    );
  });
});

describe("removing lessons and protecting used periods and rooms", () => {
  it("removes a lesson, only for an admin", async () => {
    expect(
      (await call(teacherToken, "delete", `/api/timetable/entries/${e2}`))
        .status,
    ).toBe(403);
    expect(
      (await call(adminToken, "delete", `/api/timetable/entries/${e2}`)).status,
    ).toBe(200);
    expect(
      (await call(adminToken, "delete", `/api/timetable/entries/${e2}`)).status,
    ).toBe(404);
    expect((await put(slot(c9b, 1, P.p1, english, R2))).status).toBe(201);
  });

  it("keeps a period with lessons from being deleted or turned into a break", async () => {
    const del = await call(
      adminToken,
      "delete",
      `/api/timetable/periods/${P.p1}`,
    );
    expect(del.status).toBe(400);
    expect(del.body.error).toMatch(/has lessons/);
    const brk = await call(
      adminToken,
      "put",
      `/api/timetable/periods/${P.p1}`,
      {
        name: "Period 1",
        start_time: "08:00",
        end_time: "08:40",
        is_break: true,
      },
    );
    expect(brk.status).toBe(400);
    expect(brk.body.error).toMatch(/has lessons/);
  });

  it("does not rebuild the school day while lessons exist", async () => {
    const res = await call(
      adminToken,
      "post",
      "/api/timetable/periods/generate",
      { start_time: "07:30", lesson_minutes: 45, lessons: 6, breaks: [] },
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Lessons already exist/);
    expect(await periods()).toHaveLength(5);
  });

  it("keeps a classroom that is used from being deleted", async () => {
    const res = await call(
      adminToken,
      "delete",
      `/api/timetable/classrooms/${R1}`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/used in the timetable/);
  });

  it("is read-only in a closed academic year", async () => {
    const oldYear = await createYear("2025/2026", "closed");
    const oldClass = await createClass(oldYear, "Grade 9", "A");
    await assign(oldClass, math, T1.id);
    const raw = await pool.query(
      `INSERT INTO timetable_entries (academic_year_id, class_id, subject_id, teacher_id, day, period_id)
       VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`,
      [oldYear.id, oldClass, math, T1.id, P.p1],
    );
    const add = await put(slot(oldClass, 2, P.p1, math));
    expect(add.status).toBe(400);
    expect(add.body.error).toMatch(/closed/);
    const del = await call(
      adminToken,
      "delete",
      `/api/timetable/entries/${raw.rows[0].id}`,
    );
    expect(del.status).toBe(400);
    expect(del.body.error).toMatch(/closed/);
    const still = await pool.query(
      "SELECT COUNT(*)::int AS n FROM timetable_entries WHERE id = $1",
      [raw.rows[0].id],
    );
    expect(still.rows[0].n).toBe(1);
  });
});
