// ============================================================
// AMS - SECURITY & ERROR LOGGING SYSTEM
// ============================================================

// 1. BASIC CYBERSECURITY (Prevent Right-Click & Dev Tools shortcuts)
document.addEventListener('contextmenu', event => event.preventDefault()); // Disable right-click

document.addEventListener('keydown', event => {
  // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
  if (event.key === 'F12' || 
     (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'J')) || 
     (event.ctrlKey && event.key === 'U')) {
    event.preventDefault();
  }
});

// 2. ERROR LOGGER FOR AI DEBUGGING
// This catches invisible errors and logs them to your Supabase database automatically
window.addEventListener('error', async function(event) {
  await logErrorToDB({
    message: event.message,
    source_file: event.filename,
    line: event.lineno,
    col: event.colno,
    stack: event.error ? event.error.stack : 'No stack trace',
    user_agent: navigator.userAgent
  });
});

window.addEventListener('unhandledrejection', async function(event) {
  await logErrorToDB({
    message: event.reason ? event.reason.message || event.reason : 'Unhandled Promise Rejection',
    stack: event.reason && event.reason.stack ? event.reason.stack : 'No stack trace',
    source_file: 'Promise Rejection',
    user_agent: navigator.userAgent
  });
});

async function logErrorToDB(errorData) {
  try {
    if (typeof supabase === 'undefined') return; // Supabase not loaded yet
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    
    await sb.from('error_logs').insert([errorData]);
    console.error("🚨 [AMS LOGGER] Error successfully recorded to database for AI debugging.");
  } catch (err) {
    console.error("Failed to save error log:", err);
  }
}