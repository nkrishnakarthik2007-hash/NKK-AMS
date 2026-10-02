// ============================================================
// AMS — ATTENDANCE MANAGEMENT SYSTEM
// CONTROLLER (PORTAL, BATCHES, ATTENDANCE, EXCEL, USERS)
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

// State Variables
let currentUser = null;
let currentProfile = null;
let allBatches = [];
let permittedBatches = [];
let currentBatch = null;

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
  el.className = "form-message " + type;
}

function clearMessage(elementId) {
  const el = $(elementId);
  if (!el) return;
  el.textContent = "";
  el.className = "form-message";
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
  if (msg.includes("No API key found")) return "Supabase publishable key is missing in config.js.";
  if (msg.includes("Failed to fetch")) return "Network connection error.";
  return msg;
}

// ------------------------------------------------------------
// CLOCK
// ------------------------------------------------------------
function initLiveClock() {
  function updateTime() {
    const now = new Date();
    const dateFormatted = now.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    const timeFormatted = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
    const badge = $("liveClockText");
    if (badge) {
      badge.textContent = `${dateFormatted} • ${timeFormatted} (IST)`;
    }
  }
  updateTime();
  setInterval(updateTime, 1000);
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

function setDateSelectorsToToday() {
  const today = new Date();
  $("dailyYearSelector").value = String(today.getFullYear());
  $("dailyMonthSelector").value = String(today.getMonth() + 1).padStart(2, "0");
  populateDailyDays();
  $("dailyDaySelector").value = String(today.getDate()).padStart(2, "0");
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
    showMessage("loginMessage", "Enter Employee ID and password.", "error");
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
    const userDisplay = `${profile.name || profile.employee_id} (${profile.role})`;
    $("loggedInUser").textContent = userDisplay;
    $("hubLoggedInUser").textContent = userDisplay;

    if (profile.role === "ADMIN") {
      $("usersNavTab").style.display = "inline-block";
      $("adminBatchControls").style.display = "block";
    } else {
      $("usersNavTab").style.display = "none";
      $("adminBatchControls").style.display = "none";
    }

    populateYearSelects();
    const today = new Date();
    $("dailyMonthSelector").value = String(today.getMonth() + 1).padStart(2, "0");
    $("registerMonthSelector").value = String(today.getMonth() + 1).padStart(2, "0");
    $("reportMonthSelector").value = String(today.getMonth() + 1).padStart(2, "0");
    populateDailyDays();
    $("dailyDaySelector").value = String(today.getDate()).padStart(2, "0");

    await openBatchHub();
  } catch (err) {
    console.error("Startup error:", err);
    await sb.auth.signOut();
    showLoginScreen();
    showMessage("loginMessage", getReadableError(err), "error");
    $("loginButton").disabled = false;
    $("loginButton").textContent = "Sign In";
  }
}

function showLoginScreen() {
  $("loginScreen").style.display = "flex";
  $("batchHubScreen").style.display = "none";
  $("appScreen").style.display = "none";
  checkActiveSession();
}

async function checkActiveSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const block = $("activeSessionBlock");
    if (session && session.user) {
      block.style.display = "block";
    } else {
      block.style.display = "none";
    }
  } catch (e) {
    $("activeSessionBlock").style.display = "none";
  }
}

// ------------------------------------------------------------
// BATCH HUB & PERMISSIONS
// ------------------------------------------------------------
async function openBatchHub() {
  $("loginScreen").style.display = "none";
  $("appScreen").style.display = "none";
  $("batchHubScreen").style.display = "block";

  const { data: bData } = await sb.from("batches").select("*").order("name", { ascending: true });
  allBatches = bData || [];

  if (currentProfile.role === "ADMIN") {
    permittedBatches = allBatches;
    $("hubSubtitle").textContent = "Administrative Directory: Manage batch workspaces and staff allocations.";
  } else {
    const { data: allocData } = await sb
      .from("teacher_batches")
      .select("batch_id")
      .eq("profile_id", currentProfile.id);

    const allowedIds = new Set((allocData || []).map(a => a.batch_id));
    permittedBatches = allBatches.filter(b => allowedIds.has(b.id));
    $("hubSubtitle").textContent = "Instructor Directory: Access assigned batches to record daily attendance.";
  }

  renderBatchesGrid();
}

function renderBatchesGrid() {
  const grid = $("batchesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (permittedBatches.length === 0) {
    grid.innerHTML = `
      <div class="empty-hub-box">
        <h3>No Batches Assigned</h3>
        <p>You have not been assigned to any training batches yet. Please contact an administrator.</p>
      </div>
    `;
    return;
  }

  const isSuperAdmin = currentProfile.role === "ADMIN";

  permittedBatches.forEach(b => {
    const card = document.createElement("div");
    card.className = "batch-item-card";
    card.innerHTML = `
      <div class="batch-top-row">
        <span class="batch-badge">BATCH</span>
        ${isSuperAdmin ? `
          <div class="batch-admin-actions">
            <button type="button" class="btn-micro edit-batch-btn" data-id="${b.id}" data-name="${escapeHtml(b.name)}">Edit</button>
            <button type="button" class="btn-micro text-danger batch-delete-btn" data-id="${b.id}" data-name="${escapeHtml(b.name)}">Delete</button>
          </div>
        ` : ""}
      </div>
      <h3 class="batch-title">${escapeHtml(b.name)}</h3>
      <p class="batch-caption">Trainee Attendance Workspace</p>
      <button type="button" class="btn-open-batch" data-id="${b.id}">Open Workspace →</button>
    `;
    grid.appendChild(card);
  });
}

async function selectBatch(batchId) {
  const b = allBatches.find(item => item.id === batchId);
  if (!b) return;
  currentBatch = b;

  $("workspaceBatchTitle").textContent = `${b.name} — Attendance Workspace`;
  $("batchHubScreen").style.display = "none";
  $("appScreen").style.display = "block";

  await loadBatchWorkspaceData();

  renderDailyAttendance();
  renderStudents();
  renderRegisterTable();
  renderReportStudentSelector();

  if (currentProfile.role === "ADMIN") loadUsersList();
}

function openCreateBatchModal() {
  $("batchModalTitle").textContent = "Create New Batch";
  $("batchEditId").value = "";
  $("newBatchName").value = "";
  clearMessage("batchFormMessage");
  $("batchModal").style.display = "flex";
  $("newBatchName").focus();
}

function openEditBatchModal(batchId, batchName) {
  $("batchModalTitle").textContent = "Rename Batch";
  $("batchEditId").value = batchId;
  $("newBatchName").value = batchName;
  clearMessage("batchFormMessage");
  $("batchModal").style.display = "flex";
  $("newBatchName").focus();
}

function closeBatchModal() {
  $("batchModal").style.display = "none";
}

async function saveBatch(batchId, name) {
  clearMessage("batchFormMessage");
  const cleanName = name.trim();
  if (!cleanName) {
    showMessage("batchFormMessage", "Enter batch name.", "error");
    return;
  }

  try {
    if (batchId) {
      const { error } = await sb.from("batches").update({ name: cleanName }).eq("id", batchId);
      if (error) throw error;
    } else {
      const { error } = await sb.from("batches").insert({ name: cleanName });
      if (error) throw error;
    }
    closeBatchModal();
    await openBatchHub();
  } catch (err) {
    showMessage("batchFormMessage", getReadableError(err), "error");
  }
}

async function deleteBatch(batchId, batchName) {
  if (currentProfile.role !== "ADMIN") {
    alert("Only Administrators can delete a batch.");
    return;
  }

  const confirmed = confirm(`Are you sure you want to delete "${batchName}"?`);
  if (!confirmed) return;

  try {
    const { error } = await sb.from("batches").delete().eq("id", batchId);
    if (error) throw error;
    await openBatchHub();
  } catch (err) {
    alert("Delete batch error: " + getReadableError(err));
  }
}

// ------------------------------------------------------------
// LOAD DATA FOR ACTIVE BATCH
// ------------------------------------------------------------
async function loadBatchWorkspaceData() {
  if (!currentBatch) return;

  const [studRes, datesRes, attRes] = await Promise.all([
    sb.from("students").select("*").eq("batch_id", currentBatch.id).order("employee_id", { ascending: true }),
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
          ${students.length === 0 ? "No students in this batch. Add students in the Students tab." : "No matching trainees found."}
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
            class="btn-mark btn-present ${status === "Present" ? "selected" : ""}"
            data-student-id="${s.id}"
            data-status="Present"
          >
            Present
          </button>
          <button
            type="button"
            class="btn-mark btn-absent ${status === "Absent" ? "selected" : ""}"
            data-student-id="${s.id}"
            data-status="Absent"
          >
            Absent
          </button>
        </div>
      </td>
      <td>
        <span class="status-pill ${status === "Present" ? "pill-present" : status === "Absent" ? "pill-absent" : "pill-notmarked"}">
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

    await loadBatchWorkspaceData();
    renderDailyAttendance();
    showMessage("dailySaveMessage", `Attendance records saved for ${formatDateDisplay(selectedDate)}`, "success");
  } catch (err) {
    console.error("Save error:", err);
    showMessage("dailySaveMessage", getReadableError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Attendance Records";
  }
}

// ------------------------------------------------------------
// REGISTER & EXCEL EXPORT
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
      <td>${escapeHtml(s.name)} ${s.status === "LEFT" ? '<span style="color:#dc2626; font-size:11px;">(Left)</span>' : ""}</td>
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
    showMessage("monthlyMessage", "Register copied! Paste directly into Excel (Dates in DD-MM-YYYY format with exact Present/Absent values).", "success");
  } catch (err) {
    console.error("Clipboard failure:", err);
    showMessage("monthlyMessage", "Could not copy automatically. Check browser permissions.", "error");
  }
}

// ------------------------------------------------------------
// STUDENTS
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
        <span class="status-pill ${isLeft ? "pill-notmarked" : "pill-active"}">
          ${isLeft ? "Left / Discontinued" : "Active"}
        </span>
      </td>
      <td>
        <button type="button" class="btn-table-action edit-student-btn" data-id="${s.id}">Edit</button>
        <button type="button" class="btn-table-action toggle-left-btn" data-id="${s.id}" data-current="${s.status || "ACTIVE"}">
          ${isLeft ? "Reactivate" : "Mark as Left"}
        </button>
        <button type="button" class="btn-table-action text-danger delete-student-btn" data-id="${s.id}">Delete</button>
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
        batch_id: currentBatch.id
      });
    }

    if (res.error) throw res.error;

    await loadBatchWorkspaceData();
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
  const actionText = newStatus === "LEFT" ? "mark this student as Left?" : "reactivate this student?";
  if (!confirm(`Are you sure you want to ${actionText}`)) return;

  try {
    const { error } = await sb.from("students").update({ status: newStatus }).eq("id", studentId);
    if (error) throw error;
    await loadBatchWorkspaceData();
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
    await loadBatchWorkspaceData();
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
    area.innerHTML = `<p class="empty-state">Select a student from the list.</p>`;
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
          <span class="status-pill ${status === "Present" ? "pill-present" : status === "Absent" ? "pill-absent" : "pill-notmarked"}">
            ${status}
          </span>
        </td>
      </tr>
    `;
  }).join("");

  const total = p + a;
  const pct = total > 0 ? ((p / total) * 100).toFixed(1) : "0.0";

  area.innerHTML = `
    <div class="report-summary-grid">
      <div class="rep-card"><strong>Student ID</strong><span>${escapeHtml(student.employee_id)}</span></div>
      <div class="rep-card"><strong>Name</strong><span>${escapeHtml(student.name)}</span></div>
      <div class="rep-card"><strong>Present</strong><span>${p}</span></div>
      <div class="rep-card"><strong>Absent</strong><span>${a}</span></div>
      <div class="rep-card"><strong>Attendance %</strong><span>${pct}%</span></div>
    </div>
    <div class="table-wrapper">
      <table class="data-table">
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
// USERS, PERMISSIONS & PASSWORD RESET
// ------------------------------------------------------------
async function loadUsersList() {
  const body = $("usersTableBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px;">Loading user accounts...</td></tr>`;

  try {
    const [uRes, allocRes] = await Promise.all([
      sb.from("profiles").select("*").order("created_at", { ascending: true }),
      sb.from("teacher_batches").select("profile_id, batch_id")
    ]);

    if (uRes.error) throw uRes.error;
    const users = uRes.data || [];
    const allocations = allocRes.data || [];

    body.innerHTML = "";
    users.forEach((u, i) => {
      const isSuper = u.employee_id === "241536";
      const userAllocations = allocations.filter(a => a.profile_id === u.id);
      const allocatedNames = userAllocations
        .map(a => {
          const matched = allBatches.find(b => b.id === a.batch_id);
          return matched ? matched.name : null;
        })
        .filter(Boolean);

      const allocationLabel = u.role === "ADMIN" 
        ? '<span class="text-success font-bold">All Batches (Admin)</span>'
        : (allocatedNames.length > 0 ? allocatedNames.join(", ") : '<span style="color:#94a3b8;">None allocated</span>');

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(u.employee_id)}</strong></td>
        <td>${escapeHtml(u.name)}</td>
        <td><span class="status-pill ${u.role === "ADMIN" ? "pill-admin" : "pill-teacher"}">${u.role}</span></td>
        <td>${allocationLabel}</td>
        <td>
          <button type="button" class="btn-table-action reset-pwd-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}">Reset Pwd</button>
          ${u.role !== "ADMIN" ? `<button type="button" class="btn-table-action allocate-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}">Allocate</button>` : ""}
          ${isSuper ? '<span style="color:#64748b; font-size:12px; margin-left:6px;">Primary</span>' : `
            <button type="button" class="btn-table-action text-danger delete-user-btn" data-id="${u.id}">Remove</button>
          `}
        </td>
      `;
      body.appendChild(row);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Failed to load accounts: ${getReadableError(err)}</td></tr>`;
  }
}

function openPasswordModal(userId, userName) {
  $("passwordTargetUserId").value = userId;
  $("passwordModalTitle").textContent = `Reset Password — ${userName}`;
  $("newStaffPassword").value = "";
  clearMessage("passwordFormMessage");
  $("passwordModal").style.display = "flex";
  $("newStaffPassword").focus();
}

function closePasswordModal() {
  $("passwordModal").style.display = "none";
}

async function handlePasswordReset() {
  clearMessage("passwordFormMessage");
  const userId = $("passwordTargetUserId").value;
  const newPassword = $("newStaffPassword").value;

  if (!newPassword || newPassword.length < 6) {
    showMessage("passwordFormMessage", "Password must be at least 6 characters.", "error");
    return;
  }

  const btn = $("savePasswordButton");
  btn.disabled = true;
  btn.textContent = "Updating...";

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session ? session.access_token : "";

    const payload = {
      action: "updateUser",
      userId: userId,
      password: newPassword
    };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const resData = await res.json().catch(() => ({}));
    if (!res.ok || resData.error) throw new Error(resData.error || `Update failed (${res.status})`);

    closePasswordModal();
    alert("Password updated successfully.");
  } catch (err) {
    showMessage("passwordFormMessage", getReadableError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Update Password";
  }
}

async function openAllocateModal(profileId, teacherName) {
  $("allocateProfileId").value = profileId;
  $("allocateModalTitle").textContent = `Allocate Batches — ${teacherName}`;
  clearMessage("allocateFormMessage");

  const { data: currentAlloc } = await sb
    .from("teacher_batches")
    .select("batch_id")
    .eq("profile_id", profileId);

  const allocatedSet = new Set((currentAlloc || []).map(a => a.batch_id));

  const listContainer = $("allocateBatchCheckboxes");
  listContainer.innerHTML = "";

  if (allBatches.length === 0) {
    listContainer.innerHTML = `<p style="color:#64748b; font-size:13px;">No batches exist. Create batches first.</p>`;
  } else {
    allBatches.forEach(b => {
      const label = document.createElement("label");
      label.className = "checkbox-item";
      label.innerHTML = `
        <input type="checkbox" value="${b.id}" ${allocatedSet.has(b.id) ? "checked" : ""}>
        <span>${escapeHtml(b.name)}</span>
      `;
      listContainer.appendChild(label);
    });
  }

  $("allocateModal").style.display = "flex";
}

function closeAllocateModal() {
  $("allocateModal").style.display = "none";
}

async function saveBatchAllocation() {
  clearMessage("allocateFormMessage");
  const profileId = $("allocateProfileId").value;
  const checkboxes = document.querySelectorAll("#allocateBatchCheckboxes input[type='checkbox']");
  const selectedBatchIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

  const btn = $("saveAllocateButton");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    await sb.from("teacher_batches").delete().eq("profile_id", profileId);

    if (selectedBatchIds.length > 0) {
      const rows = selectedBatchIds.map(bid => ({
        profile_id: profileId,
        batch_id: bid
      }));
      const { error: insErr } = await sb.from("teacher_batches").insert(rows);
      if (insErr) throw insErr;
    }

    closeAllocateModal();
    loadUsersList();
  } catch (err) {
    showMessage("allocateFormMessage", getReadableError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Allocation";
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
  document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active-section"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));

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
    currentBatch = null;
    showLoginScreen();
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
  initLiveClock();

  // Continue to workspace button
  $("landingContinueBtn").addEventListener("click", async () => {
    await enterApp();
  });

  // Login Form
  $("loginForm").addEventListener("submit", e => {
    e.preventDefault();
    login($("loginEmployeeId").value, $("loginPassword").value);
  });

  // Hub Navigation
  $("switchBatchBtn").addEventListener("click", openBatchHub);

  // Batch Hub Actions
  $("createBatchBtn").addEventListener("click", openCreateBatchModal);
  $("closeBatchModal").addEventListener("click", closeBatchModal);
  $("cancelBatchButton").addEventListener("click", closeBatchModal);
  $("batchForm").addEventListener("submit", e => {
    e.preventDefault();
    saveBatch($("batchEditId").value, $("newBatchName").value);
  });

  $("batchesGrid").addEventListener("click", e => {
    const enterBtn = e.target.closest(".btn-open-batch");
    const editBtn = e.target.closest(".edit-batch-btn");
    const delBtn = e.target.closest(".batch-delete-btn");

    if (enterBtn) {
      selectBatch(enterBtn.dataset.id);
      return;
    }
    if (editBtn) {
      openEditBatchModal(editBtn.dataset.id, editBtn.dataset.name);
      return;
    }
    if (delBtn) {
      deleteBatch(delBtn.dataset.id, delBtn.dataset.name);
    }
  });

  // Workspace Navigation
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.section);
      if (btn.dataset.section === "monthlySection") renderRegisterTable();
      if (btn.dataset.section === "reportsSection") renderStudentReport();
      if (btn.dataset.section === "usersSection") loadUsersList();
    });
  });

  // Daily Attendance Controls
  $("dailyYearSelector").addEventListener("change", () => {
    populateDailyDays();
    renderDailyAttendance();
  });
  $("dailyMonthSelector").addEventListener("change", () => {
    populateDailyDays();
    renderDailyAttendance();
  });
  $("dailyDaySelector").addEventListener("change", renderDailyAttendance);
  $("setTodayBtn").addEventListener("click", () => {
    setDateSelectorsToToday();
    renderDailyAttendance();
  });
  $("studentSearch").addEventListener("input", renderDailyAttendance);

  $("dailyAttendanceBody").addEventListener("click", e => {
    const btn = e.target.closest(".btn-mark");
    if (!btn) return;
    handleAttendanceButton(btn.dataset.studentId, btn.dataset.status);
  });
  $("saveAttendanceButton").addEventListener("click", saveAttendance);

  // Register
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

  // Users & Password Reset
  $("addUserButton").addEventListener("click", openUserModal);
  $("closeUserModal").addEventListener("click", closeUserModal);
  $("cancelUserButton").addEventListener("click", closeUserModal);
  $("userForm").addEventListener("submit", e => {
    e.preventDefault();
    createNewUser($("userEmployeeId").value, $("userName").value, $("userRole").value, $("userPassword").value);
  });

  $("usersTableBody").addEventListener("click", e => {
    const allocBtn = e.target.closest(".allocate-btn");
    const resetPwdBtn = e.target.closest(".reset-pwd-btn");
    const delBtn = e.target.closest(".delete-user-btn");

    if (allocBtn) {
      openAllocateModal(allocBtn.dataset.id, allocBtn.dataset.name);
      return;
    }
    if (resetPwdBtn) {
      openPasswordModal(resetPwdBtn.dataset.id, resetPwdBtn.dataset.name);
      return;
    }
    if (delBtn) {
      removeUser(delBtn.dataset.id);
    }
  });

  // Password Modal
  $("closePasswordModal").addEventListener("click", closePasswordModal);
  $("cancelPasswordButton").addEventListener("click", closePasswordModal);
  $("passwordForm").addEventListener("submit", e => {
    e.preventDefault();
    handlePasswordReset();
  });

  // Allocate Modal
  $("closeAllocateModal").addEventListener("click", closeAllocateModal);
  $("cancelAllocateButton").addEventListener("click", closeAllocateModal);
  $("allocateForm").addEventListener("submit", e => {
    e.preventDefault();
    saveBatchAllocation();
  });

  // Modals click outside
  window.addEventListener("click", e => {
    if (e.target === $("batchModal")) closeBatchModal();
    if (e.target === $("allocateModal")) closeAllocateModal();
    if (e.target === $("passwordModal")) closePasswordModal();
    if (e.target === $("studentModal")) closeStudentModal();
    if (e.target === $("userModal")) closeUserModal();
  });

  showLoginScreen();
});