// Privileged user management. service_role key stays in Supabase (auto-injected secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const mail = (id: string) => `${id}@ams.example.com`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return j({ error: "Not signed in" }, 401);
  const { data: me } = await db.from("profiles").select("role,is_active").eq("id", user.id).single();
  if (!me?.is_active || !["admin", "super_admin"].includes(me.role)) return j({ error: "Not allowed" }, 403);
  const isSuper = me.role === "super_admin";
  const b = await req.json();
  const emp = String(b.employee_id || "").trim();

  const { data: t } = await db.from("profiles").select("id,role").eq("employee_id", emp).single();
  if (!t) return j({ error: "User not found" }, 404);
  if (!isSuper && t.role !== "teacher") return j({ error: "Admins can only manage Teachers" }, 403);

  if (b.action === "reset_password") {
    if (String(b.password || "").length < 8) return j({ error: "Password min 8 chars" }, 400);
    const { error } = await db.auth.admin.updateUserById(t.id, { password: b.password });
    if (error) return j({ error: error.message }, 400);
    if (b.request_id) await db.from("password_reset_requests").update({ status: "done", handled_by: user.id }).eq("id", b.request_id);
    return j({ ok: true });
  }
  return j({ error: "Unknown action" }, 400);
});
