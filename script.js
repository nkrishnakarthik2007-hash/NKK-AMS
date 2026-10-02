// ============================================================
// AMS — ATTENDANCE MANAGEMENT SYSTEM
// SCRIPT CONTROLLER
// ============================================================

const EMAIL_DOMAIN = "attendance.example.com";

// ------------------------------------------------------------
// CONFIG VALIDATION
// ------------------------------------------------------------
if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
  document.body.innerHTML = `
    <div style="padding:40px; font-family:Arial,sans-serif; color:#222;">
      <h2>Configuration Error</h2>
      <p>config.js could not be loaded correctly.</p>
    </div>
  `;
  throw new Error("Supabase configuration is missing.");
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------
let currentUser = null;
let currentProfile = null;
let students = [];
let attendanceDates = [];
let attendanceRecords = [];

function $(id) {
  return document.getElementById(id);
}

function showMessage(elementId, message, type = "") {
  const element = $(elementId);
  if (!element) return;
  element.textContent = message;
  element.className = "message " + type;
}

function clearMessage(elementId) {
  const element = $(elementId);
  if (!element) return;
  element.textContent = "";
  element.className = "message";
}

function formatDateDisplay(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateString;
}

function getTodayDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
  return getTodayDate().slice(0, 7);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getReadableError(error) {
  if (!error) return "An unexpected error occurred.";
  const msg = error.message || error.error_description || String(error);
  if (msg.includes("Invalid login credentials")) return "Invalid Employee ID / Email or password.";
  if (msg.includes("No API key found")) return "Supabase publishable key not detected in config.js.";
  if (msg.includes("Failed to fetch")) return "Unable to connect to Supabase server.";
  return msg;
}

// ------------------------------------------------------------
// AUTHENTICATION
// ------------------------------------------------------------
async function login(credentialInput, password) {
  clearMessage("loginMessage");
  const input = credentialInput.trim();
  if (!input || !password) {
    showMessage("loginMessage", "Please enter your ID and password.", "error");
    return;
  }

  const email = input.includes("@") ? input.toLowerCase() : `${input.toLowerCase()}@${EMAIL_DOMAIN}`;

  const loginBtn = $("loginButton");
  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data || !data.user) throw new Error("No session created.");

    currentUser = data.user;
    await enterApp();
  } catch (err) {
    console.error("Login failure:", err);
    showMessage("loginMessage", getReadableError(err), "error");
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
}

async function enterApp() {
  try {
    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError || !user) throw userError || new Error("User session invalid.");

    currentUser = user;

    let { data: profile, error: profileErr } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) throw profileErr;

    if (!profile) {
      const emailPrefix = (user.email || "").split("@")[0].toUpperCase();
      const isAdminID = ["241536", "ADMIN001"].includes(emailPrefix);
      const { data: newProf, error: insErr } = await sb
        .from("profiles")
        .insert({
          id: user.id,
          employee_id: emailPrefix || "241536",
          name: emailPrefix === "241536" ? "Super Admin" : "Administrator",
          role: isAdminID ? "ADMIN" : "USER",
          active: true
        })
        .select()
        .single();

      if (insErr) throw insErr;
      profile = newProf;
    }

    if (profile.active === false) {
      await sb.auth.signOut();
      throw new Error("This account is currently marked inactive.");
    }

    currentProfile = profile;

    const displayName = profile.name || profile.employee_id || user.email;
    $("loggedInUser").textContent = `${displayName} (${profile.role})`;

    if (profile.role === "ADMIN") {
      $("usersNavTab").style.display = "inline-block";
    } else {
      $("usersNavTab").style.display = "none";
    }

    $("loginScreen").style.display = "none";
    $("appScreen").style.display = "block";

    await loadData();
    setDefaultDates();

    renderDailyAttendance();
    renderStudents();
    renderMonthlyRegister();
    renderReportStudentSelector();

    if (profile.role === "ADMIN") {
      loadUsersList();
    }
  } catch (err) {
    console.error("App initialization error:", err);
    await sb.auth.signOut();
    currentUser = null;
    currentProfile = null;
    $("loginScreen").style.display = "flex";
    $("appScreen").style.display = "none";
    showMessage("loginMessage", getReadableError(err), "error");
    $("loginButton").disabled = false;
    $("loginButton").textContent = "Login";
  }
}

// ------------------------------------------------------------
// LOAD DATA
// ------------------------------------------------------------
async function loadData() {
  const [studRes, datesRes, attRes] = await Promise.all([
    sb.from("students").select("*").order("employee_id", { ascending: true }),
    sb.from("attendance_dates").select("*").order("attendance_date", { ascending: true }),
    sb.from("attendance").select("*")
  ]);

  if (studRes.error) throw studRes.error;
  if (datesRes.error) throw datesRes.error;
  if (attRes.error) throw attRes.error;

  students = studRes.data || [];
  attendanceDates = datesRes.data || [];
  attendanceRecords = attRes.data || [];
}

function setDefaultDates() {
  const today = getTodayDate();
  if (!$("attendanceDate").value) $("attendanceDate").value = today;
  if (!$("monthlySelector").value) $("monthlySelector").value = getCurrentMonth();
  if (!$("reportMonthSelector").value) $("reportMonthSelector").value = getCurrentMonth();
}

// ------------------------------------------------------------
// DAILY ATTENDANCE (DIRECT CALENDAR SELECTION)
// ------------------------------------------------------------
function renderDailyAttendance() {
  const body = $("dailyAttendanceBody");
  if (!body) return;

  const search = $("studentSearch").value.trim().toLowerCase();
  const selectedDate = $("attendanceDate").value;

  body.innerHTML = "";

  const activeStudents = students.filter(s => s.status !== "LEFT");
  const filtered = activeStudents.filter(student => {
    if (!search) return true;
    const emp = String(student.employee_id || "").toLowerCase();
    const name = String(student.name || "").toLowerCase();
    return emp.includes(search) || name.includes(search);
  });

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #667085; padding: 24px;">
          ${students.length === 0 ? "No students in batch. Add students in the Students tab." : "No matching students found."}
        </td>
      </tr>
    `;
    updateDailySummary();
    return;
  }

  filtered.forEach((student, index) => {
    const existing = attendanceRecords.find(
      r => r.student_id === student.id && r.attendance_date === selectedDate
    );
    const status = existing ? existing.status : "Not Marked";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(student.employee_id)}</strong></td>
      <td>${escapeHtml(student.name)}</td>
      <td>
        <div class="attendance-buttons">
          <button
            type="button"
            class="attendance-button present-button ${status === "Present" ? "selected" : ""}"
            data-student-id="${student.id}"
            data-status="Present"
          >
            Present
          </button>
          <button
            type="button"
            class="attendance-button absent-button ${status === "Absent" ? "selected" : ""}"
            data-student-id="${student.id}"
            data-status="Absent"
          >
            Absent
          </button>
        </div>
      </td>
      <td>
        <span class="status-badge ${
          status === "Present"
            ? "status-present"
            : status === "Absent"
            ? "status-absent"
            : "status-not-marked"
        }">
          ${status}
        </span>
      </td>
    `;
    body.appendChild(row);
  });

  updateDailySummary();
}

function handleAttendanceButton(studentId, status) {
  const selectedDate = $("attendanceDate").value;
  if (!selectedDate) {
    showMessage("dailySaveMessage", "Please pick a date from the calendar.", "error");
    return;
  }

  const existingIndex = attendanceRecords.findIndex(
    r => r.student_id === studentId && r.attendance_date === selectedDate
  );

  const updatedRecord = {
    student_id: studentId,
    attendance_date: selectedDate,
    status: status
  };

  if (existingIndex >= 0) {
    attendanceRecords[existingIndex] = {
      ...attendanceRecords[existingIndex],
      ...updatedRecord
    };
  } else {
    attendanceRecords.push(updatedRecord);
  }

  renderDailyAttendance();
  clearMessage("dailySaveMessage");
}

function updateDailySummary() {
  const selectedDate = $("attendanceDate").value;
  const activeStudents = students.filter(s => s.status !== "LEFT");
  const total = activeStudents.length;

  const present = attendanceRecords.filter(
    r => r.attendance_date === selectedDate && r.status === "Present"
  ).length;

  const absent = attendanceRecords.filter(
    r => r.attendance_date === selectedDate && r.status === "Absent"
  ).length;

  const notMarked = Math.max(0, total - present - absent);

  $("dailyTotal").textContent = total;
  $("dailyPresent").textContent = present;
  $("dailyAbsent").textContent = absent;
  $("dailyNotMarked").textContent = notMarked;
}

async function saveAttendance() {
  const selectedDate = $("attendanceDate").value;
  if (!selectedDate) {
    showMessage("dailySaveMessage", "Pick a date first.", "error");
    return;
  }

  const recordsForDate = attendanceRecords
    .filter(
      r => r.attendance_date === selectedDate && (r.status === "Present" || r.status === "Absent")
    )
    .map(r => ({
      student_id: r.student_id,
      attendance_date: r.attendance_date,
      status: r.status
    }));

  if (recordsForDate.length === 0) {
    showMessage("dailySaveMessage", "Please mark at least one student Present or Absent.", "error");
    return;
  }

  const saveBtn = $("saveAttendanceButton");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    await sb
      .from("attendance_dates")
      .upsert({ attendance_date: selectedDate }, { onConflict: "attendance_date", ignoreDuplicates: true });

    const { error } = await sb
      .from("attendance")
      .upsert(recordsForDate, { onConflict: "attendance_date,student_id" });

    if (error) throw error;

    await loadData();
    renderDailyAttendance();
    showMessage("dailySaveMessage", "Attendance successfully saved for " + formatDateDisplay(selectedDate), "success");
  } catch (err) {
    console.error("Save error:", err);
    showMessage("dailySaveMessage", getReadableError(err), "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Attendance";
  }
}

// ------------------------------------------------------------
// MONTHLY REGISTER
// ------------------------------------------------------------
function renderMonthlyRegister() {
  const month = $("monthlySelector").value;
  const head = $("monthlyTableHead");
  const body = $("monthlyTableBody");
  if (!head || !body) return;

  head.innerHTML = "";
  body.innerHTML = "";
  if (!month) return;

  const datesInMonth = attendanceDates
    .filter(item => item.attendance_date.startsWith(month))
    .map(item => item.attendance_date)
    .sort();

  const headerRow = document.createElement("tr");
  headerRow.innerHTML = `
    <th>S.No</th>
    <th>Employee ID</th>
    <th>Student Name</th>
  `;

  datesInMonth.forEach(date => {
    const th = document.createElement("th");
    th.textContent = formatDateDisplay(date).slice(0, 5);
    headerRow.appendChild(th);
  });

  headerRow.innerHTML += `
    <th>Present</th>
    <th>Absent</th>
    <th>%</th>
  `;
  head.appendChild(headerRow);

  students.forEach((student, index) => {
    let presentCount = 0;
    let absentCount = 0;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(student.employee_id)}</strong></td>
      <td>${escapeHtml(student.name)} ${student.status === "LEFT" ? '<span style="color:#b33e3e; font-size:11px;">(Left)</span>' : ""}</td>
    `;

    datesInMonth.forEach(date => {
      const record = attendanceRecords.find(
        r => r.student_id === student.id && r.attendance_date === date
      );
      const status = record ? record.status : "-";
      if (status === "Present") presentCount++;
      if (status === "Absent") absentCount++;

      const td = document.createElement("td");
      td.textContent = status === "Present" ? "P" : status === "Absent" ? "A" : "-";
      if (status === "Present") td.className = "status-present-pill";
      if (status === "Absent") td.className = "status-absent-pill";
      row.appendChild(td);
    });

    const totalMarked = presentCount + absentCount;
    const percentage = totalMarked > 0 ? ((presentCount / totalMarked) * 100).toFixed(1) : "0.0";

    row.innerHTML += `
      <td><strong>${presentCount}</strong></td>
      <td>${absentCount}</td>
      <td><strong>${percentage}%</strong></td>
    `;
    body.appendChild(row);
  });
}

async function copyMonthlyTable() {
  const table = $("monthlyTable");
  if (!table) return;

  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) {
    showMessage("monthlyMessage", "No register data available to copy.", "error");
    return;
  }

  const text = rows
    .map(row => Array.from(row.querySelectorAll("th, td")).map(c => c.textContent.trim()).join("\t"))
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showMessage("monthlyMessage", "Monthly register copied. Paste directly into Microsoft Excel.", "success");
  } catch (err) {
    showMessage("monthlyMessage", "Could not copy table automatically.", "error");
  }
}

// ------------------------------------------------------------
// STUDENT MANAGEMENT
// ------------------------------------------------------------
function renderStudents() {
  const body = $("studentsTableBody");
  if (!body) return;
  body.innerHTML = "";

  students.forEach((student, index) => {
    const isLeft = student.status === "LEFT";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(student.employee_id)}</strong></td>
      <td>${escapeHtml(student.name)}</td>
      <td>
        <span class="status-badge ${isLeft ? "status-left" : "status-active"}">
          ${isLeft ? "Left / Inactive" : "Active"}
        </span>
      </td>
      <td>
        <button type="button" class="small-button edit-student-btn" data-id="${student.id}">Edit</button>
        <button type="button" class="small-button toggle-left-btn" data-id="${student.id}" data-current="${student.status || "ACTIVE"}">
          ${isLeft ? "Reactivate" : "Mark as Left"}
        </button>
        <button type="button" class="small-button delete-student-btn danger" data-id="${student.id}">Delete</button>
      </td>
    `;
    body.appendChild(row);
  });
}

async function saveStudent(employeeId, name, studentId = null) {
  const cleanId = employeeId.trim().toUpperCase();
  const cleanName = name.trim();

  if (!cleanId || !cleanName) {
    showMessage("studentFormMessage", "Enter Employee ID and Name.", "error");
    return;
  }

  try {
    let res;
    if (studentId) {
      res = await sb.from("students").update({ employee_id: cleanId, name: cleanName }).eq("id", studentId);
    } else {
      res = await sb.from("students").insert({ employee_id: cleanId, name: cleanName, status: "ACTIVE" });
    }

    if (res.error) throw res.error;

    await loadData();
    renderStudents();
    renderDailyAttendance();
    renderMonthlyRegister();
    renderReportStudentSelector();
    closeStudentModal();
  } catch (err) {
    showMessage("studentFormMessage", getReadableError(err), "error");
  }
}

async function toggleStudentLeft(studentId, currentStatus) {
  const newStatus = currentStatus === "LEFT" ? "ACTIVE" : "LEFT";
  const actionText = newStatus === "LEFT" ? "mark this student as Left (Discontinued)?" : "reactivate this student?";
  if (!confirm(`Are you sure you want to ${actionText}`)) return;

  try {
    const { error } = await sb.from("students").update({ status: newStatus }).eq("id", studentId);
    if (error) throw error;
    await loadData();
    renderStudents();
    renderDailyAttendance();
  } catch (err) {
    alert(getReadableError(err));
  }
}

async function deleteStudent(studentId) {
  const student = students.find(s => s.id === studentId);
  if (!student) return;
  if (!confirm(`Permanently delete student ${student.name} (${student.employee_id})?`)) return;

  try {
    const { error } = await sb.from("students").delete().eq("id", studentId);
    if (error) throw error;
    await loadData();
    renderStudents();
    renderDailyAttendance();
    renderMonthlyRegister();
    renderReportStudentSelector();
  } catch (err) {
    alert(getReadableError(err));
  }
}

// ------------------------------------------------------------
// REPORTS
// ------------------------------------------------------------
function renderReportStudentSelector() {
  const sel = $("reportStudentSelector");
  if (!sel) return;
  sel.innerHTML = `<option value="">Select Student</option>`;
  students.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.employee_id} - ${s.name} ${s.status === "LEFT" ? "(Left)" : ""}`;
    sel.appendChild(opt);
  });
}

function renderStudentReport() {
  const studentId = $("reportStudentSelector").value;
  const month = $("reportMonthSelector").value;
  const area = $("studentReport");

  if (!studentId || !month) {
    area.innerHTML = `<p class="empty-message">Select a student and month to view attendance history.</p>`;
    return;
  }

  const student = students.find(s => String(s.id) === String(studentId));
  if (!student) return;

  const datesInMonth = attendanceDates
    .filter(item => item.attendance_date.startsWith(month))
    .map(item => item.attendance_date)
    .sort();

  let present = 0;
  let absent = 0;

  const rows = datesInMonth.map(date => {
    const r = attendanceRecords.find(item => String(item.student_id) === String(studentId) && item.attendance_date === date);
    const status = r ? r.status : "Not Marked";
    if (status === "Present") present++;
    if (status === "Absent") absent++;

    return `
      <tr>
        <td>${formatDateDisplay(date)}</td>
        <td>
          <span class="status-badge ${status === "Present" ? "status-present" : status === "Absent" ? "status-absent" : "status-not-marked"}">
            ${status}
          </span>
        </td>
      </tr>
    `;
  }).join("");

  const total = present + absent;
  const pct = total > 0 ? ((present / total) * 100).toFixed(1) : "0.0";

  area.innerHTML = `
    <div class="report-summary">
      <div><strong>Student ID</strong><span>${escapeHtml(student.employee_id)}</span></div>
      <div><strong>Name</strong><span>${escapeHtml(student.name)}</span></div>
      <div><strong>Present</strong><span>${present}</span></div>
      <div><strong>Absent</strong><span>${absent}</span></div>
      <div><strong>Attendance %</strong><span>${pct}%</span></div>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Attendance Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="2">No dates recorded for this month.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ------------------------------------------------------------
// USER MANAGEMENT (TEACHERS & ADMINS)
// ------------------------------------------------------------
async function loadUsersList() {
  const body = $("usersTableBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px;">Loading accounts...</td></tr>`;

  try {
    const { data: users, error } = await sb.from("profiles").select("*").order("created_at", { ascending: true });
    if (error) throw error;

    body.innerHTML = "";
    users.forEach((u, i) => {
      const isSuper = u.employee_id === "241536";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(u.employee_id)}</strong></td>
        <td>${escapeHtml(u.name)}</td>
        <td><span class="status-badge ${u.role === "ADMIN" ? "status-admin" : "status-teacher"}">${u.role}</span></td>
        <td>${u.active ? "Active" : "Inactive"}</td>
        <td>
          ${isSuper ? '<span style="color:#667085; font-size:12px;">Primary Admin</span>' : `
            <button type="button" class="small-button delete-user-btn danger" data-id="${u.id}">Remove</button>
          `}
        </td>
      `;
      body.appendChild(row);
    });
  } catch (err) {
    console.error("Users list error:", err);
    body.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Failed to load users: ${getReadableError(err)}</td></tr>`;
  }
}

async function createNewUser(employeeId, name, role, password) {
  clearMessage("userFormMessage");

  const cleanEmployeeId = employeeId.trim().toUpperCase();
  const cleanName = name.trim();

  if (!cleanEmployeeId || !cleanName) {
    showMessage("userFormMessage", "Enter Employee ID and Name.", "error");
    return;
  }

  if (!password || password.length < 6) {
    showMessage("userFormMessage", "Password must be at least 6 characters long.", "error");
    return;
  }

  const saveBtn = $("saveUserButton");
  saveBtn.disabled = true;
  saveBtn.textContent = "Creating...";

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session ? session.access_token : "";

    // Comprehensive payload compatible with action name variants: 'create', 'add', 'createUser'
    const payload = {
      action: "create",
      type: "create",
      employee_id: cleanEmployeeId,
      employeeId: cleanEmployeeId,
      name: cleanName,
      role: role,
      password: password
    };

    let res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    let resData = await res.json().catch(() => ({}));

    // If 'create' was not recognized, retry with 'createUser'
    if (!res.ok && resData.error && resData.error.includes("Unknown action")) {
      payload.action = "createUser";
      res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      resData = await res.json().catch(() => ({}));
    }

    if (!res.ok || resData.error) {
      throw new Error(resData.error || `Server responded with status ${res.status}`);
    }

    closeUserModal();
    loadUsersList();
  } catch (err) {
    console.error("Create user error:", err);
    showMessage("userFormMessage", getReadableError(err), "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Create Account";
  }
}

async function removeUser(userId) {
  if (!confirm("Are you sure you want to remove this user login?")) return;

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session ? session.access_token : "";

    const payload = {
      action: "delete",
      userId: userId,
      id: userId
    };

    let res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    let resData = await res.json().catch(() => ({}));

    // If 'delete' was not recognized, fallback to 'deleteUser'
    if (!res.ok && resData.error && resData.error.includes("Unknown action")) {
      payload.action = "deleteUser";
      res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      resData = await res.json().catch(() => ({}));
    }

    if (!res.ok || resData.error) throw new Error(resData.error || "Failed to delete user.");

    loadUsersList();
  } catch (err) {
    alert(getReadableError(err));
  }
}

// ------------------------------------------------------------
// MODAL CONTROLS
// ------------------------------------------------------------
function openStudentModal(student = null) {
  $("studentModal").style.display = "flex";
  clearMessage("studentFormMessage");
  if (student) {
    $("studentModalTitle").textContent = "Edit Student";
    $("studentEditId").value = student.id;
    $("studentEmployeeId").value = student.employee_id;
    $("studentName").value = student.name;
  } else {
    $("studentModalTitle").textContent = "Add Student";
    $("studentEditId").value = "";
    $("studentEmployeeId").value = "";
    $("studentName").value = "";
  }
  $("studentEmployeeId").focus();
}

function closeStudentModal() {
  $("studentModal").style.display = "none";
  $("studentForm").reset();
  clearMessage("studentFormMessage");
}

function openUserModal() {
  $("userModal").style.display = "flex";
  $("userForm").reset();
  clearMessage("userFormMessage");
}

function closeUserModal() {
  $("userModal").style.display = "none";
  $("userForm").reset();
  clearMessage("userFormMessage");
}

function showSection(sectionId) {
  document.querySelectorAll(".app-section").forEach(s => s.classList.remove("active-section"));
  document.querySelectorAll(".nav-button").forEach(b => b.classList.remove("active"));

  const target = $(sectionId);
  if (target) target.classList.add("active-section");

  const btn = document.querySelector(`[data-section="${sectionId}"]`);
  if (btn) btn.classList.add("active");
}

async function logout() {
  try {
    await sb.auth.signOut();
  } catch (err) {
    console.error("Logout error:", err);
  } finally {
    currentUser = null;
    currentProfile = null;
    $("appScreen").style.display = "none";
    $("loginScreen").style.display = "flex";
    $("loginForm").reset();
    clearMessage("loginMessage");
    $("loginButton").disabled = false;
    $("loginButton").textContent = "Login";
  }
}

// ------------------------------------------------------------
// EVENT LISTENERS
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  $("loginForm").addEventListener("submit", e => {
    e.preventDefault();
    login($("loginEmployeeId").value, $("loginPassword").value);
  });

  $("logoutButton").addEventListener("click", logout);

  document.querySelectorAll(".nav-button").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.section);
      if (btn.dataset.section === "monthlySection") renderMonthlyRegister();
      if (btn.dataset.section === "reportsSection") renderStudentReport();
      if (btn.dataset.section === "usersSection") loadUsersList();
    });
  });

  $("studentSearch").addEventListener("input", renderDailyAttendance);
  $("attendanceDate").addEventListener("change", renderDailyAttendance);

  $("dailyAttendanceBody").addEventListener("click", e => {
    const btn = e.target.closest(".attendance-button");
    if (!btn) return;
    handleAttendanceButton(btn.dataset.studentId, btn.dataset.status);
  });

  $("saveAttendanceButton").addEventListener("click", saveAttendance);

  $("monthlySelector").addEventListener("change", renderMonthlyRegister);
  $("copyMonthlyButton").addEventListener("click", copyMonthlyTable);

  $("addStudentButton").addEventListener("click", () => openStudentModal());
  $("closeStudentModal").addEventListener("click", closeStudentModal);
  $("cancelStudentButton").addEventListener("click", closeStudentModal);

  $("studentForm").addEventListener("submit", e => {
    e.preventDefault();
    saveStudent($("studentEmployeeId").value, $("studentName").value, $("studentEditId").value || null);
  });

  $("studentsTableBody").addEventListener("click", e => {
    const editBtn = e.target.closest(".edit-student-btn");
    const toggleBtn = e.target.closest(".toggle-left-btn");
    const delBtn = e.target.closest(".delete-student-btn");

    if (editBtn) {
      const student = students.find(s => String(s.id) === String(editBtn.dataset.id));
      if (student) openStudentModal(student);
      return;
    }
    if (toggleBtn) {
      toggleStudentLeft(toggleBtn.dataset.id, toggleBtn.dataset.current);
      return;
    }
    if (delBtn) {
      deleteStudent(delBtn.dataset.id);
    }
  });

  $("reportStudentSelector").addEventListener("change", renderStudentReport);
  $("reportMonthSelector").addEventListener("change", renderStudentReport);

  $("addUserButton").addEventListener("click", openUserModal);
  $("closeUserModal").addEventListener("click", closeUserModal);
  $("cancelUserButton").addEventListener("click", closeUserModal);

  $("userForm").addEventListener("submit", e => {
    e.preventDefault();
    createNewUser(
      $("userEmployeeId").value,
      $("userName").value,
      $("userRole").value,
      $("userPassword").value
    );
  });

  $("usersTableBody").addEventListener("click", e => {
    const delBtn = e.target.closest(".delete-user-btn");
    if (delBtn) removeUser(delBtn.dataset.id);
  });

  window.addEventListener("click", e => {
    if (e.target === $("studentModal")) closeStudentModal();
    if (e.target === $("userModal")) closeUserModal();
  });

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      await enterApp();
    }
  } catch (err) {
    console.warn("Session restore check:", err);
  }
});