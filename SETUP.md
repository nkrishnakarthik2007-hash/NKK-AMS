# Student Attendance Register — Final Setup Guide

This repository contains the complete frontend and backend code for the Attendance Management System (AMS)[cite: 7, 8].

---

## 1. Folder Structure

Ensure your workspace directory is organized as follows[cite: 7, 8]:

```text
student-attendance/
│
├── index.html                           # Main web app layout and modals[cite: 7, 8]
├── style.css                            # Clean institutional styling[cite: 7, 8]
├── script.js                            # Frontend logic and Supabase client controller[cite: 7, 8]
├── config.js                            # Public Supabase URL & publishable key[cite: 7, 8]
├── README.md                            # High-level architecture overview[cite: 7, 8]
├── SETUP.md                             # Step-by-step setup documentation[cite: 7, 8]
│
└── supabase/
    ├── schema.sql                       # Database schema, triggers, and RLS policies[cite: 7, 8]
    ├── config.toml                      # Supabase CLI project configuration[cite: 7, 8]
    │
    └── functions/
        └── admin-users/
            └── index.ts                 # Secure admin user & password management function[cite: 7, 8]