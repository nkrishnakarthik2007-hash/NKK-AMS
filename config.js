// ============================================================
// AMS — SUPABASE PUBLIC CLIENT CONFIGURATION
// ============================================================
// IMPORTANT:
// SUPABASE_URL must be ONLY the project URL.
// DO NOT add /functions/v1/admin-users
// DO NOT add /auth/v1
// DO NOT add a trailing path.

const SUPABASE_URL = "https://dggokugqqeddfydcjvpb.supabase.co";

// Paste your Supabase Publishable (anon) key below.
// Get it from: Supabase Dashboard > Project Settings > API
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Qpr9qKeEfxvdYCwHIospmg_sxXLqKJR";

// Guard against accidentally pasting a function/auth path into the URL.
if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(SUPABASE_URL)) {
  throw new Error(
    "Invalid SUPABASE_URL. Use only https://YOUR_PROJECT_REF.supabase.co"
  );
}