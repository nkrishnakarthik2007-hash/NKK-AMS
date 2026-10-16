// ============================================================
// AMS - MASTER APPLICATION CONTROLLER
// ============================================================

// Initialize Supabase (relies on config.js)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Global State
let currentUser = null;
let currentProfile = null;
let students = [];
let attendanceData = [];

// ==========================================
// 1. INITIALIZATION & AUTHENTICATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  populateDateFilters();
  await checkSession();

  // Event Listeners for UI
  document.getElementById('btnShowLogin').addEventListener('click', () => {
    document.getElementById('loginModal').style.display = 'flex';
  });
  document.getElementById('btnCloseLogin').addEventListener('click', () => {
    document.getElementById('loginModal').style.display = 'none';
  });
  document.getElementById('btnContinue').addEventListener('click', openWorkspace);
  document.getElementById('btnLogout').addEventListener('click', logout);
  
  // Event Listeners for Actions
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('btnLoadData').addEventListener('click', loadRosterData);
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);
  
  // Event Listeners for Adding Students
  document.getElementById('btnAddStudent').addEventListener('click', () => {
    document.getElementById('studentModal').style.display = 'flex';
  });
  document.getElementById('btnCloseStudent').addEventListener('click', () => {
    document.getElementById('studentModal').style.display = 'none';
  });
  document.getElementById('studentForm').addEventListener('submit', handleAddStudent);
});

async function checkSession() {
  try {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) throw error;
    
    document.getElementById('loadingState').style.display = 'none';
    
    if (session && session.user) {
      currentUser = session.user;
      document.getElementById('btnContinue').style.display = 'inline-flex';
      document.getElementById('btnShowLogin').style.display = 'none';
      await fetchUserProfile();
    } else {
      document.getElementById('btnShowLogin').style.display = 'inline-flex';
      document.getElementById('btnContinue').style.display = 'none';
    }
  } catch (err) {
    console.error("Session check failed", err);
    document.getElementById('loadingState').textContent = "Connection error. Please refresh.";
  }
}

async function fetchUserProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) currentProfile = data;
}

async function handleLogin(e) {
  e.preventDefault();
  const id = document.getElementById('loginId').value.trim();
  const pw = document.getElementById('loginPassword').value;
  const btn = document.getElementById('btnLoginSubmit');
  const msg = document.getElementById('loginMessage');
  
  btn.disabled = true;
  btn.textContent = "Authenticating...";
  msg.textContent = "";

  try {
    const email = `${id.toLowerCase()}@attendance.example.com`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
    
    currentUser = data.user;
    await fetchUserProfile();
    
    document.getElementById('loginModal').style.display = 'none';
    openWorkspace();
  } catch (err) {
    msg.textContent = "Invalid Employee ID or Password.";
    btn.disabled = false;
    btn.textContent = "Authenticate";
  }
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  document.getElementById('workspaceScreen').style.display = 'none';
  document.getElementById('landingScreen').style.display = 'flex';
  document.getElementById('loginForm').reset();
  
  document.getElementById('btnShowLogin').style.display = 'inline-flex';
  document.getElementById('btnContinue').style.display = 'none';
  document.getElementById('btnLoginSubmit').disabled = false;
  document.getElementById('btnLoginSubmit').textContent = "Authenticate";
}

// ==========================================
// 2. WORKSPACE & DATA LOADING
// ==========================================
async function openWorkspace() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('workspaceScreen').style.display = 'block';
  document.getElementById('currentUserBadge').textContent = currentProfile ? currentProfile.name : "Admin";
  
  // Hide the add student button if the user is not an ADMIN
  if (currentProfile && currentProfile.role !== 'ADMIN') {
    document.getElementById('btnAddStudent').style.display = 'none';
  }
  
  await loadRosterData();
}

function populateDateFilters() {
  const yearSelect = document.getElementById('filterYear');
  const currentYear = new Date().getFullYear();
  for (let y = 2024; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }
  
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  document.getElementById('filterMonth').value = currentMonth;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function loadRosterData() {
  const btn = document.getElementById('btnLoadData');
  const originalText = btn.textContent;
  btn.textContent = "Loading...";
  btn.disabled = true;

  try {
    const year = document.getElementById('filterYear').value;
    const month = document.getElementById('filterMonth').value;
    const specificDate = document.getElementById('filterDate').value;
    
    let dateStart = `${year}-${month}-01`;
    let dateEnd = `${year}-${month}-${getDaysInMonth(year, month)}`;
    
    if (specificDate) {
      dateStart = specificDate;
      dateEnd = specificDate;
    }

    const [stuRes, attRes] = await Promise.all([
      sb.from('students').select('*').eq('status', 'ACTIVE').order('employee_id'),
      sb.from('attendance').select('*').gte('attendance_date', dateStart).lte('attendance_date', dateEnd)
    ]);

    if (stuRes.error) throw stuRes.error;
    if (attRes.error) throw attRes.error;

    students = stuRes.data || [];
    attendanceData = attRes.data || [];
    
    renderExcelGrid(year, month, specificDate);
  } catch (err) {
    console.error(err);
    alert("Error loading data. Please check console.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ==========================================
// 3. EXCEL-STYLE GRID RENDERING
// ==========================================
function renderExcelGrid(year, month, specificDate) {
  const thead = document.getElementById('gridHeader');
  const tbody = document.getElementById('gridBody');
  
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px;">No students found.</td></tr>';
    return;
  }

  // Determine dates to show
  let datesToShow = [];
  if (specificDate) {
    datesToShow.push(specificDate);
  } else {
    const days = getDaysInMonth(year, month);
    for (let i = 1; i <= days; i++) {
      datesToShow.push(`${year}-${month}-${String(i).padStart(2, '0')}`);
    }
  }

  // Build Header
  let headerHTML = '<tr><th>S.No</th><th>Employee ID</th><th>Name</th>';
  datesToShow.forEach(date => {
    const parts = date.split('-');
    headerHTML += `<th>${parts[2]}-${parts[1]}-${parts[0]}</th>`;
  });
  headerHTML += '</tr>';
  thead.innerHTML = headerHTML;

  // Build Rows
  let rowsHTML = '';
  students.forEach((student, index) => {
    rowsHTML += `<tr>
      <td>${index + 1}</td>
      <td><strong>${student.employee_id}</strong></td>
      <td>${student.name}</td>`;
      
    datesToShow.forEach(date => {
      const record = attendanceData.find(a => a.student_id === student.id && a.attendance_date === date);
      const status = record ? record.status : null;
      
      let cellContent = '';
      if (status === 'Present') {
        cellContent = `<div class="attendance-controls">
          <button type="button" class="grid-btn btn-p active" onclick="toggleAtt('${student.id}', '${date}', 'Present')">P</button>
          <button type="button" class="grid-btn btn-a" onclick="toggleAtt('${student.id}', '${date}', 'Absent')">A</button>
        </div>`;
      } else if (status === 'Absent') {
        cellContent = `<div class="attendance-controls">
          <button type="button" class="grid-btn btn-p" onclick="toggleAtt('${student.id}', '${date}', 'Present')">P</button>
          <button type="button" class="grid-btn btn-a active" onclick="toggleAtt('${student.id}', '${date}', 'Absent')">A</button>
        </div>`;
      } else {
        cellContent = `<div class="attendance-controls">
          <button type="button" class="grid-btn btn-p" onclick="toggleAtt('${student.id}', '${date}', 'Present')">P</button>
          <button type="button" class="grid-btn btn-a" onclick="toggleAtt('${student.id}', '${date}', 'Absent')">A</button>
        </div>`;
      }
      
      rowsHTML += `<td>${cellContent}</td>`;
    });
    
    rowsHTML += '</tr>';
  });
  
  tbody.innerHTML = rowsHTML;
}

// ==========================================
// 4. DATABASE OPERATIONS
// ==========================================
// Attach this to the window object so inline onclick handlers can access it
window.toggleAtt = async function(studentId, date, status) {
  try {
    const existingIndex = attendanceData.findIndex(a => a.student_id === studentId && a.attendance_date === date);
    
    if (existingIndex >= 0 && attendanceData[existingIndex].status === status) {
      return; // Already set, do nothing
    }

    // Optimistic UI Update (update local array immediately)
    if (existingIndex >= 0) {
      attendanceData[existingIndex].status = status;
    } else {
      attendanceData.push({ student_id: studentId, attendance_date: date, status: status });
    }
    
    // Re-render the grid
    const year = document.getElementById('filterYear').value;
    const month = document.getElementById('filterMonth').value;
    const specificDate = document.getElementById('filterDate').value;
    renderExcelGrid(year, month, specificDate);

    // Save to DB
    const { error } = await sb.from('attendance').upsert({
      attendance_date: date,
      student_id: studentId,
      status: status
    }, { onConflict: 'attendance_date, student_id' });

    if (error) throw error;
  } catch (err) {
    console.error("Failed to mark attendance", err);
    loadRosterData(); // Reload from DB to fix UI if it failed
  }
};

async function handleAddStudent(e) {
  e.preventDefault();
  const idInput = document.getElementById('newStudentId').value.trim();
  const nameInput = document.getElementById('newStudentName').value.trim();
  const msg = document.getElementById('studentMessage');
  const btn = e.target.querySelector('button[type="submit"]');
  
  msg.textContent = "";
  btn.disabled = true;
  btn.textContent = "Saving...";
  
  try {
    const { error } = await sb.from('students').insert({
      employee_id: idInput,
      name: nameInput
    });
    
    if (error) {
      if (error.code === '23505') throw new Error("Employee ID already exists.");
      throw error;
    }
    
    document.getElementById('studentModal').style.display = 'none';
    document.getElementById('studentForm').reset();
    await loadRosterData(); // Refresh the grid
    
  } catch (err) {
    msg.textContent = err.message || "Failed to add student.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Trainee";
  }
}

// ==========================================
// 5. EXCEL EXPORT FEATURE
// ==========================================
async function exportToExcel() {
  const btn = document.getElementById('btnExportExcel');
  
  if (students.length === 0) {
    alert("No data to copy.");
    return;
  }

  const year = document.getElementById('filterYear').value;
  const month = document.getElementById('filterMonth').value;
  const specificDate = document.getElementById('filterDate').value;
  
  let datesToShow = [];
  if (specificDate) {
    datesToShow.push(specificDate);
  } else {
    const days = getDaysInMonth(year, month);
    for (let i = 1; i <= days; i++) {
      datesToShow.push(`${year}-${month}-${String(i).padStart(2, '0')}`);
    }
  }

  // Build TSV Headers
  let tsvContent = "S.No\tEmployee ID\tName\t" + datesToShow.map(d => {
    const p = d.split('-'); return `${p[2]}-${p[1]}-${p[0]}`;
  }).join('\t') + "\n";

  // Build TSV Rows
  students.forEach((student, index) => {
    let row = `${index + 1}\t${student.employee_id}\t${student.name}`;
    datesToShow.forEach(date => {
      const record = attendanceData.find(a => a.student_id === student.id && a.attendance_date === date);
      row += `\t${record ? record.status : ''}`;
    });
    tsvContent += row + "\n";
  });

  try {
    await navigator.clipboard.writeText(tsvContent);
    const originalText = btn.textContent;
    btn.textContent = "Copied! Paste in Excel";
    setTimeout(() => { btn.textContent = originalText; }, 3000);
  } catch (err) {
    alert("Copy failed. Your browser might block clipboard access. Please manually select the table and copy.");
  }
}