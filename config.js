// ============================================================
// AMS — SUPABASE PUBLIC CLIENT CONFIGURATION
// ============================================================
const SUPABASE_URL = "https://dggokugqqeddfydcjvpb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Qpr9qKeEfxvdYCwHIospmg_sxXLqKJR";

// Safety check preventing malformed function URLs from breaking auth
if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(SUPABASE_URL)) {
  throw new Error("Invalid SUPABASE_URL. Must only be https://YOUR_PROJECT_REF.supabase.co");
}