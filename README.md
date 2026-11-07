# School Management System

A full-stack web application for managing a school (Grades 1 to 12): students, teachers, classes, attendance, grades, reports, and announcements, with role-based access for admins, teachers, and students.

## Features

- **Authentication**: login with JWT, passwords hashed with bcrypt
- **Role-based access**: admin, teacher, and student each see only what they are allowed to
- **Students and teachers**: add, edit, delete, search
- **Classes**: Grades 1 to 12 with sections A to D
- **Assignments**: assign a teacher to a subject in a class
- **Attendance**: teachers mark present, absent, or late per class per day
- **Grades**: per semester, with Individual Assignment (10), Group Assignment (10), Mid Exam (30), and Final Exam (50); scores above the maximum are rejected
- **Reports**: totals and letter grades per subject and per class, printable
- **Student portal**: each student sees only their own grades and attendance
- **Announcements**: posted by admin, read by everyone

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, React Router, Axios
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **Security**: JWT, bcrypt, parameterized SQL queries, role-based middleware, database transactions

## Screenshots

(Add screenshots here)

## How to Run

### 1. Database

Create a PostgreSQL database named `school_management`, then run `database/schema.sql`.

### 2. Backend

    cd backend
    npm install
    cp .env.example .env     (then fill in your own values)
    npm run dev

The API runs on http://localhost:5000

### 3. Frontend

    cd frontend
    npm install
    npm run dev

The app runs on http://localhost:5173

### 4. First admin

Generate a password hash:

    node -e "console.log(require('bcrypt').hashSync('YourPassword', 10))"

Then insert the admin in PostgreSQL:

    INSERT INTO users (email, password_hash, role)
    VALUES ('admin@school.com', 'PASTE_HASH_HERE', 'admin');

## Project Structure

    backend/    Express API (routes, middleware, database config)
    frontend/   React app (pages, components)
    database/   SQL schema

## Author

Your Name - 4th year Software Engineering student
# school-management
