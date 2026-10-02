# Student Attendance Register

A simple web-based attendance register for a training batch.

The project uses:

- HTML
- CSS
- JavaScript
- Supabase
- GitHub Pages

## Main Features

### Login

Users log in using:

- Employee ID
- Password

The application uses Supabase Authentication.

### Daily Attendance

The user can:

- Select a date
- Search students by Employee ID or name
- Mark Present
- Mark Absent
- See Not Marked students
- See daily totals
- Save attendance

### Student Management

Admin users can:

- Add students
- Edit students
- Delete students

Each student has:

- Employee ID
- Student Name

### Monthly Register

The monthly register shows:

- S.No
- Employee ID
- Student Name
- Date columns
- Total Present
- Total Absent
- Attendance %

The table can also be copied and pasted into Excel.

### Student Report

A student can be selected to view:

- Attendance dates
- Present
- Absent
- Not Marked
- Attendance percentage

## Project Structure

```text
student-attendance-final/
│
├── index.html
├── style.css
├── script.js
├── config.js
├── README.md
├── SETUP.md
│
└── supabase/
    ├── schema.sql
    ├── config.toml
    │
    └── functions/
        └── admin-users/
            └── index.ts