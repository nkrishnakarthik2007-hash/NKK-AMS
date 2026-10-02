// ============================================================
// AMS — ATTENDANCE MANAGEMENT SYSTEM
// CORE LOGIC & EXCEL EXPORT CONTROLLER
// ============================================================

const EMAIL_DOMAIN = "attendance.example.com";

if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
  document.body.innerHTML = `
    <div style="padding:40px; font-family:Arial,sans-serif; color:#222;">
      <h2>Configuration Error</h2>
      <p>config.js is missing or could not be loaded.</p>
    </div>
  `;
  throw new Error("Supabase configuration missing.");
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});

// State
let currentUser = null;
let currentProfile = null;
let batches = [];
let selectedBatchId = null;
let students = [];
let attendanceDates = [];
let attendanceRecords = [];

function $(id) {
  return document.getElementById(id);
}

function showMessage(elementId, message, type = "") {
  const el = $(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = "message " + type;
}

function clearMessage(elementId) {
  const el = $(elementId);
  if (!el) return;
  el.textContent = "";
  el.className = "message";
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
}

function escapeHtml(val) {
  if (val === null || val === undefined) return "";
  return String(val)
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
  if (msg.includes("No API key found")) return "Supabase publishable key is invalid or missing in config.js.";
  if (msg.includes("Failed to fetch")) return "Network error connecting to Supabase.";
  return msg;
}

// ------------------------------------------------------------
// DATE DROPDOWN GENERATORS
// ------------------------------------------------------------
function populateYearSelects() {
  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
  const currentYear = new Date().getFullYear();

  ["dailyYearSelector", "registerYearSelector", "reportYearSelector"].forEach(id => {
    const sel = $(id);
    if (!sel) return;
    sel.innerHTML = "";
    years.forEach(y => {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === currentYear) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function populateDailyDays() {
  const year = parseInt($("dailyYearSelector").value, 10);
  const month = parseInt($("dailyMonthSelector").value, 10);
  const daySel = $("dailyDaySelector");
  if (!daySel) return;

  const prevSelected = parseInt(daySel.value, 10) || new Date().getDate();
  const daysInMonth = new Date(year, month, 0).getDate();

  daySel.innerHTML = "";
  for (let d = 1; d <= daysInMonth; d++) {
    const opt = document.createElement("option");
    const valStr = String(d).padStart(2, "0");
    opt.value = valStr;
    opt.textContent = valStr;
    if (d === prevSelected || (d === daysInMonth && prevSelected > daysInMonth)) {
      opt.selected = true;
    }
    daySel.appendChild(opt);
  }
}

function getSelectedDailyDate() {
  const y = $("dailyYearSelector").value;
  const m = $("dailyMonthSelector").value;
  const d = $("dailyDaySelector").value;
  return `${y}-${m}-${d}`;
}

// ------------------------------------------------------------
// AUTHENTICATION
// ------------------------------------------------------------
async function login(credentialInput, password) {
  clearMessage("loginMessage");
  const input = credentialInput.trim();
  if (!input || !password) {
    showMessage("loginMessage", "Enter Employee ID/Email and password.", "error");
    return;
  }

  const email = input.includes("@") ? input.toLowerCase() : `${input.toLowerCase()}@${EMAIL_DOMAIN}`;
  const btn = $("loginButton");
  btn.disabled = true;
  btn.textContent = "Authenticating...";

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data || !data.user) throw new Error("No session created.");

    currentUser = data.user;
    await enterApp();
  } catch (err) {
    console.error("Login failed:", err);
    showMessage("loginMessage", getReadableError(err), "error");
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
}

async function enterApp() {
  try {
    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError || !user) throw userError || new Error("Session invalid.");
    currentUser = user;

    let { data: profile, error: profErr } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) throw profErr;

    if (!profile) {
      const emailPrefix = (user.email || "").split("@")[0].toUpperCase();
      const isAdmin = ["241536", "ADMIN001"].includes(emailPrefix);
      const { data: newProf, error: insErr } = await sb
        .from("profiles")
        .insert({
          id: user.id,
          employee_id: emailPrefix || "241536",
          name: emailPrefix === "241536" ? "Super Admin" : "Administrator",
          role: isAdmin ? "ADMIN" : "USER",
          active: true
        })
        .select()
        .single();

      if (insErr) throw insErr;
      profile = newProf;
    }

    if (!profile.active) {
      await sb.auth.signOut();
      throw new Error("This account is inactive.");
    }

    currentProfile = profile;
    $("loggedInUser").textContent = `${profile.name || profile.employee_id} (${profile.role})`;

    if (profile.role === "ADMIN") {
      $("usersNavTab").style.display = "inline-block";
    } else {
      $("usersNavTab").style.display = "none";
    }

    $("loginScreen").style.display = "none";
    $("appScreen").style.display = "block";

    populateYearSelects();
    const today = new Date();
    $("dailyMonthSelector").value = String(today.getMonth() + 1).padStart(2, "0");
    $("registerMonthSelector").value = String(today.getMonth() + 1).padStart(2, "0");
    $("reportMonthSelector").value = String(today.getMonth() + 1).padStart(2, "0");
    populateDailyDays();
    $("dailyDaySelector").value = String(today.getDate()).padStart(2, "0");

    await loadBatches();
    await loadData();

    renderDailyAttendance();
    renderStudents();
    renderRegisterTable();
    renderReportStudentSelector();

    if (profile.role === "ADMIN") loadUsersList();
  } catch (err) {
    console.error("Startup error:", err);
    await sb.auth.signOut();
    $("loginScreen").style.display = "flex";
    $("appScreen").style.display = "none";
    showMessage("loginMessage", getReadableError(err), "error");
    $("loginButton").disabled = false;
    $("loginButton").textContent = "Sign In";
  }
}

// ------------------------------------------------------------
// BATCHES
// ------------------------------------------------------------
async function loadBatches() {
  const { data, error } = await sb.from("batches").select("*").order("name", { ascending: true });
  if (error) {
    console.warn("Batches query notice:", error);
    batches = [{ id: "default", name: "Default Batch" }];
  } else {
    batches = data && data.length > 0 ? data : [{ id: "default", name: "Default Batch" }];
  }

  const sel = $("globalBatchSelector");
  sel.innerHTML = "";
  batches.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });

  if (!selectedBatchId || !batches.some(b => b.id === selectedBatchId)) {
    selectedBatchId = batches[0].id;
  }
  sel.value = selectedBatchId;
}

async function createBatch(name) {
  clearMessage("batchFormMessage");
  const cleanName = name.trim();
  if (!cleanName) {
    showMessage("batchFormMessage", "Enter batch name.", "error");
    return;
  }

  try {
    const { data, error } = await sb.from("batches").insert({ name: cleanName }).select().single();
    if (error) throw error;
    await loadBatches();
    selectedBatchId = data.id;
    $("globalBatchSelector").value = selectedBatchId;
    closeBatchModal();
    await loadData();
    renderDailyAttendance();
    renderStudents();
    renderRegisterTable();
    renderReportStudentSelector();
  } catch (err) {
    showMessage("batchFormMessage", getReadableError(err), "error");
  }
}

// ------------------------------------------------------------
// LOAD DATA
// ------------------------------------------------------------
async function loadData() {
  let studQuery = sb.from("students").select("*").order("employee_id", { ascending: true });
  if (selectedBatchId && selectedBatchId !== "default") {
    studQuery = studQuery.eq("batch_id", selectedBatchId);
  }

  const [studRes, datesRes, attRes] = await Promise.all([
    studQuery,
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

// ------------------------------------------------------------
// DAILY ATTENDANCE
// ------------------------------------------------------------
function renderDailyAttendance() {
  const body = $("dailyAttendanceBody");
  if (!body) return;

  const search = $("studentSearch").value.trim().toLowerCase();
  const selectedDate = getSelectedDailyDate();

  body.innerHTML = "";

  const activeStudents = students.filter(s => s.status !== "LEFT");
  const filtered = activeStudents.filter(s => {
    if (!search) return true;
    return (s.employee_id || "").toLowerCase().includes(search) || (s.name || "").toLowerCase().includes(search);
  });

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:24px; color:#64748b;">
          ${students.length === 0 ? "No students in this batch. Add students in the Students tab." : "No matching students found."}
        </td>
      </tr>
    `;
    updateDailySummary();
    return;
  }

  filtered.forEach((s, idx) => {
    const existing = attendanceRecords.find(r => r.student_id === s.id && r.attendance_date === selectedDate);
    const status = existing ? existing.status : "Not Marked";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(s.employee_id)}</strong></td>
      <td>${escapeHtml(s.name)}</td>
      <td>
        <div class="attendance-buttons">
          <button
            type="button"
            class="attendance-button present-btn ${status === "Present" ? "selected" : ""}"
            data-student-id="${s.id}"
            data-status="Present"
          >
            Present
          </button>
          <button
            type="button"
            class="attendance-button absent-btn ${status === "Absent" ? "selected" : ""}"
            data-student-id="${s.id}"
            data-status="Absent"
          >
            Absent
          </button>
        </div>
      </td>
      <td>
        <span class="status-badge ${status === "Present" ? "badge-present" : status === "Absent" ? "badge-absent" : "badge-notmarked"}">
          ${status}
        </span>
      </td>
    `;
    body.appendChild(row);
  });

  updateDailySummary();
}

function handleAttendanceButton(studentId, status) {
  const selectedDate = getSelectedDailyDate();
  const idx = attendanceRecords.findIndex(r => r.student_id === studentId && r.attendance_date === selectedDate);
  const newRec = { student_id: studentId, attendance_date: selectedDate, status };

  if (idx >= 0) {
    attendanceRecords[idx] = { ...attendanceRecords[idx], ...newRec };
  } else {
    attendanceRecords.push(newRec);
  }

  renderDailyAttendance();
  clearMessage("dailySaveMessage");
}

function updateDailySummary() {
  const selectedDate = getSelectedDailyDate();
  const activeStudents = students.filter(s => s.status !== "LEFT");
  const total = activeStudents.length;

  const present = attendanceRecords.filter(r => r.attendance_date === selectedDate && r.status === "Present").length;
  const absent = attendanceRecords.filter(r => r.attendance_date === selectedDate && r.status === "Absent").length;
  const notMarked = Math.max(0, total - present - absent);

  $("dailyTotal").textContent = total;
  $("dailyPresent").textContent = present;
  $("dailyAbsent").textContent = absent;
  $("dailyNotMarked").textContent = notMarked;
}

async function saveAttendance() {
  const selectedDate = getSelectedDailyDate();
  const records = attendanceRecords
    .filter(r => r.attendance_date === selectedDate && (r.status === "Present" || r.status === "Absent"))
    .map(r => ({
      student_id: r.student_id,
      attendance_date: r.attendance_date,
      status: r.status
    }));

  if (records.length === 0) {
    showMessage("dailySaveMessage", "Mark at least one student Present or Absent.", "error");
    return;
  }

  const btn = $("saveAttendanceButton");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    await sb.from("attendance_dates").upsert({ attendance_date: selectedDate }, { onConflict: "attendance_date" });
    const { error } = await sb.from("attendance").upsert(records, { onConflict: "attendance_date,student_id" });
    if (error) throw error;

    await loadData();
    renderDailyAttendance();
    showMessage("dailySaveMessage", `Attendance saved for ${formatDateDisplay(selectedDate)}`, "success");
  } catch (err) {
    console.error("Save error:", err);
    showMessage("dailySaveMessage", getReadableError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Attendance";
  }
}

// ------------------------------------------------------------
// REGISTER (MONTHLY / YEARLY) & COPY FOR EXCEL
// ------------------------------------------------------------
function getRegisterDates() {
  const mode = $("registerViewMode").value;
  const year = $("registerYearSelector").value;
  const month = $("registerMonthSelector").value;

  if (mode === "yearly") {
    return attendanceDates
      .filter(d => d.attendance_date.startsWith(`${year}-`))
      .map(d => d.attendance_date)
      .sort();
  }

  const prefix = `${year}-${month}`;
  return attendanceDates
    .filter(d => d.attendance_date.startsWith(prefix))
    .map(d => d.attendance_date)
    .sort();
}

function renderRegisterTable() {
  const head = $("monthlyTableHead");
  const body = $("monthlyTableBody");
  if (!head || !body) return;

  head.innerHTML = "";
  body.innerHTML = "";

  const dates = getRegisterDates();

  const trHead = document.createElement("tr");
  trHead.innerHTML = `
    <th>S.No</th>
    <th>Employee ID</th>
    <th>Student Name</th>
  `;

  dates.forEach(d => {
    const th = document.createElement("th");
    th.textContent = formatDateDisplay(d);
    trHead.appendChild(th);
  });

  trHead.innerHTML += `
    <th>Total Present</th>
    <th>Total Absent</th>
    <th>Attendance %</th>
  `;
  head.appendChild(trHead);

  if (students.length === 0) {
    body.innerHTML = `<tr><td colspan="${dates.length + 6}" style="text-align:center; padding:20px; color:#64748b;">No students enrolled in this batch.</td></tr>`;
    return;
  }

  students.forEach((s, idx) => {
    let pCount = 0;
    let aCount = 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(s.employee_id)}</strong></td>
      <td>${escapeHtml(s.name)} ${s.status === "LEFT" ? '<span style="color:#b33e3e; font-size:11px;">(Left)</span>' : ""}</td>
    `;

    dates.forEach(d => {
      const rec = attendanceRecords.find(r => r.student_id === s.id && r.attendance_date === d);
      const status = rec ? rec.status : "-";

      if (status === "Present") pCount++;
      if (status === "Absent") aCount++;

      const td = document.createElement("td");
      td.textContent = status;
      if (status === "Present") td.className = "cell-present";
      if (status === "Absent") td.className = "cell-absent";
      tr.appendChild(td);
    });

    const total = pCount + aCount;
    const pct = total > 0 ? ((pCount / total) * 100).toFixed(1) : "0.0";

    tr.innerHTML += `
      <td><strong>${pCount}</strong></td>
      <td>${aCount}</td>
      <td><strong>${pct}%</strong></td>
    `;
    body.appendChild(tr);
  });
}

async function copyRegisterForExcel() {
  clearMessage("monthlyMessage");
  const dates = getRegisterDates();

  if (students.length === 0) {
    showMessage("monthlyMessage", "No student data available to copy.", "error");
    return;
  }

  const headers = ["S.No", "Employee ID", "Student Name", ...dates.map(d => formatDateDisplay(d)), "Total Present", "Total Absent", "Attendance %"];
  const rows = [headers.join("\t")];

  students.forEach((s, idx) => {
    let pCount = 0;
    let aCount = 0;

    const row = [idx + 1, s.employee_id, s.name];

    dates.forEach(d => {
      const rec = attendanceRecords.find(r => r.student_id === s.id && r.attendance_date === d);
      const status = rec ? rec.status : "-";
      if (status === "Present") pCount++;
      if (status === "Absent") aCount++;
      row.push(status);
    });

    const total = pCount + aCount;
    const pct = total > 0 ? `${((pCount / total) * 100).toFixed(1)}%` : "0.0%";

    row.push(pCount, aCount, pct);
    rows.push(row.join("\t"));
  });

  const tsvData = rows.join("\n");

  try {
    await navigator.clipboard.writeText(tsvData);
    showMessage("monthlyMessage", "Register copied! Paste directly into Excel (Dates in DD-MM-YYYY format with exact Present/Absent statuses).", "success");
  } catch (err) {
    console.error("Clipboard failure:", err);
    showMessage("monthlyMessage", "Could not copy automatically. Check browser clipboard permissions.", "error");
  }
}

// ------------------------------------------------------------
// STUDENTS ROSTER
// ------------------------------------------------------------
function renderStudents() {
  const body = $("studentsTableBody");
  if (!body) return;
  body.innerHTML = "";

  students.forEach((s, idx) => {
    const isLeft = s.status === "LEFT";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(s.employee_id)}</strong></td>
      <td>${escapeHtml(s.name)}</td>
      <td>
        <span class="status-badge ${isLeft ? "badge-left" : "badge-active"}">
          ${isLeft ? "Left / Inactive" : "Active"}
        </span>
      </td>
      <td>
        <button type="button" class="small-button edit-student-btn" data-id="${s.id}">Edit</button>
        <button type="button" class="small-button toggle-left-btn" data-id="${s.id}" data-current="${s.status || "ACTIVE"}">
          ${isLeft ? "Reactivate" : "Mark as Left"}
        </button>
        <button type="button" class="small-button delete-student-btn danger" data-id="${s.id}">Delete</button>
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
      res = await sb.from("students").insert({
        employee_id: cleanId,
        name: cleanName,
        status: "ACTIVE",
        batch_id: selectedBatchId !== "default" ? selectedBatchId : null
      });
    }

    if (res.error) throw res.error;

    await loadData();
    renderStudents();
    renderDailyAttendance();
    renderRegisterTable();
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
  const s = students.find(item => item.id === studentId);
  if (!s) return;
  if (!confirm(`Permanently delete student ${s.name} (${s.employee_id})?`)) return;

  try {
    const { error } = await sb.from("students").delete().eq("id", studentId);
    if (error) throw error;
    await loadData();
    renderStudents();
    renderDailyAttendance();
    renderRegisterTable();
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
  const year = $("reportYearSelector").value;
  const month = $("reportMonthSelector").value;
  const area = $("studentReport");

  if (!studentId) {
    area.innerHTML = `<p class="empty-message">Select a student from the list.</p>`;
    return;
  }

  const student = students.find(s => String(s.id) === String(studentId));
  if (!student) return;

  const dates = attendanceDates
    .map(d => d.attendance_date)
    .filter(d => {
      if (!d.startsWith(`${year}-`)) return false;
      return month === "all" || d.startsWith(`${year}-${month}`);
    })
    .sort();

  let p = 0;
  let a = 0;

  const rows = dates.map(d => {
    const rec = attendanceRecords.find(r => String(r.student_id) === String(studentId) && r.attendance_date === d);
    const status = rec ? rec.status : "Not Marked";
    if (status === "Present") p++;
    if (status === "Absent") a++;

    return `
      <tr>
        <td>${formatDateDisplay(d)}</td>
        <td>
          <span class="status-badge ${status === "Present" ? "badge-present" : status === "Absent" ? "badge-absent" : "badge-notmarked"}">
            ${status}
          </span>
        </td>
      </tr>
    `;
  }).join("");

  const total = p + a;
  const pct = total > 0 ? ((p / total) * 100).toFixed(1) : "0.0";

  area.innerHTML = `
    <div class="report-summary">
      <div><strong>Student ID</strong><span>${escapeHtml(student.employee_id)}</span></div>
      <div><strong>Name</strong><span>${escapeHtml(student.name)}</span></div>
      <div><strong>Present</strong><span>${p}</span></div>
      <div><strong>Absent</strong><span>${a}</span></div>
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
          ${rows || `<tr><td colspan="2">No dates recorded for this range.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ------------------------------------------------------------
// TEACHERS & ADMINS MANAGEMENT
// ------------------------------------------------------------
async function loadUsersList() {
  const body = $("usersTableBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px;">Loading user accounts...</td></tr>`;

  try {
    const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: true });
    if (error) throw error;

    body.innerHTML = "";
    data.forEach((u, i) => {
      const isSuper = u.employee_id === "241536";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(u.employee_id)}</strong></td>
        <td>${escapeHtml(u.name)}</td>
        <td><span class="status-badge ${u.role === "ADMIN" ? "badge-admin" : "badge-teacher"}">${u.role}</span></td>
        <td>${u.active ? "Active" : "Inactive"}</td>
        <td>
          ${isSuper ? '<span style="color:#64748b; font-size:12px;">Primary Admin</span>' : `
            <button type="button" class="small-button delete-user-btn danger" data-id="${u.id}">Remove</button>
          `}
        </td>
      `;
      body.appendChild(row);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Failed to load accounts: ${getReadableError(err)}</td></tr>`;
  }
}

async function createNewUser(employeeId, name, role, password) {
  clearMessage("userFormMessage");
  const cleanId = employeeId.trim().toUpperCase();
  const cleanName = name.trim();

  if (!cleanId || !cleanName) {
    showMessage("userFormMessage", "Enter Employee ID and Name.", "error");
    return;
  }
  if (!password || password.length < 6) {
    showMessage("userFormMessage", "Password must be at least 6 characters.", "error");
    return;
  }

  const btn = $("saveUserButton");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session ? session.access_token : "";

    const payload = {
      action: "create",
      type: "create",
      employee_id: cleanId,
      employeeId: cleanId,
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

    if (!res.ok || resData.error) throw new Error(resData.error || `Error ${res.status}`);

    closeUserModal();
    loadUsersList();
  } catch (err) {
    showMessage("userFormMessage", getReadableError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
}

async function removeUser(userId) {
  if (!confirm("Are you sure you want to remove this user?")) return;

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session ? session.access_token : "";

    const payload = { action: "delete", userId, id: userId };
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
// MODALS & NAVIGATION
// ------------------------------------------------------------
function openBatchModal() {
  $("batchModal").style.display = "flex";
  $("batchForm").reset();
  clearMessage("batchFormMessage");
  $("newBatchName").focus();
}

function closeBatchModal() {
  $("batchModal").style.display = "none";
}

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
    console.error("SignOut error:", err);
  } finally {
    currentUser = null;
    currentProfile = null;
    $("appScreen").style.display = "none";
    $("loginScreen").style.display = "flex";
    $("loginForm").reset();
    clearMessage("loginMessage");
    $("loginButton").disabled = false;
    $("loginButton").textContent = "Sign In";
  }
}

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Login & Logout
  $("loginForm").addEventListener("submit", e => {
    e.preventDefault();
    login($("loginEmployeeId").value, $("loginPassword").value);
  });
  $("logoutButton").addEventListener("click", logout);

  // Global Batch Change
  $("globalBatchSelector").addEventListener("change", async e => {
    selectedBatchId = e.target.value;
    await loadData();
    renderDailyAttendance();
    renderStudents();
    renderRegisterTable();
    renderReportStudentSelector();
  });

  $("openBatchModalBtn").addEventListener("click", openBatchModal);
  $("closeBatchModal").addEventListener("click", closeBatchModal);
  $("cancelBatchButton").addEventListener("click", closeBatchModal);
  $("batchForm").addEventListener("submit", e => {
    e.preventDefault();
    createBatch($("newBatchName").value);
  });

  // Navigation
  document.querySelectorAll(".nav-button").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.section);
      if (btn.dataset.section === "monthlySection") renderRegisterTable();
      if (btn.dataset.section === "reportsSection") renderStudentReport();
      if (btn.dataset.section === "usersSection") loadUsersList();
    });
  });

  // Daily Attendance Date Dropdowns
  $("dailyYearSelector").addEventListener("change", () => {
    populateDailyDays();
    renderDailyAttendance();
  });
  $("dailyMonthSelector").addEventListener("change", () => {
    populateDailyDays();
    renderDailyAttendance();
  });
  $("dailyDaySelector").addEventListener("change", renderDailyAttendance);
  $("studentSearch").addEventListener("input", renderDailyAttendance);

  $("dailyAttendanceBody").addEventListener("click", e => {
    const btn = e.target.closest(".attendance-button");
    if (!btn) return;
    handleAttendanceButton(btn.dataset.studentId, btn.dataset.status);
  });
  $("saveAttendanceButton").addEventListener("click", saveAttendance);

  // Register (Monthly / Yearly)
  $("registerViewMode").addEventListener("change", e => {
    $("registerMonthWrapper").style.display = e.target.value === "yearly" ? "none" : "block";
    renderRegisterTable();
  });
  $("registerYearSelector").addEventListener("change", renderRegisterTable);
  $("registerMonthSelector").addEventListener("change", renderRegisterTable);
  $("copyMonthlyButton").addEventListener("click", copyRegisterForExcel);

  // Students
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
      const s = students.find(item => String(item.id) === String(editBtn.dataset.id));
      if (s) openStudentModal(s);
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

  // Reports
  $("reportStudentSelector").addEventListener("change", renderStudentReport);
  $("reportYearSelector").addEventListener("change", renderStudentReport);
  $("reportMonthSelector").addEventListener("change", renderStudentReport);

  // Users
  $("addUserButton").addEventListener("click", openUserModal);
  $("closeUserModal").addEventListener("click", closeUserModal);
  $("cancelUserButton").addEventListener("click", closeUserModal);
  $("userForm").addEventListener("submit", e => {
    e.preventDefault();
    createNewUser($("userEmployeeId").value, $("userName").value, $("userRole").value, $("userPassword").value);
  });

  $("usersTableBody").addEventListener("click", e => {
    const delBtn = e.target.closest(".delete-user-btn");
    if (delBtn) removeUser(delBtn.dataset.id);
  });

  // Modals click outside
  window.addEventListener("click", e => {
    if (e.target === $("batchModal")) closeBatchModal();
    if (e.target === $("studentModal")) closeStudentModal();
    if (e.target === $("userModal")) closeUserModal();
  });

  // Restore Session
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      await enterApp();
    }
  } catch (err) {
    console.warn("Session restore check:", err);
  }
});