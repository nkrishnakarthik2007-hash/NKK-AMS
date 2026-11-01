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

  if (b.action === "create_user") {
    const role = b.role;
    if (!["admin", "teacher"].includes(role)) return j({ error: "Invalid role" }, 400);
    if (role === "admin" && !isSuper) return j({ error: "Only Super Admin can create Admins" }, 403);
    if (!/^[A-Za-z0-9]{1,30}$/.test(emp) || !b.name || String(b.password || "").length < 8)
      return j({ error: "Employee ID (letters/digits), name and password (min 8 chars) required" }, 400);
    const { data, error } = await db.auth.admin.createUser({ email: mail(emp), password: b.password, email_confirm: true });
    if (error) return j({ error: error.message }, 400);
    const { error: e2 } = await db.from("profiles").insert({ id: data.user.id, employee_id: emp, name: b.name, email: b.email || null, phone: b.phone || null, role });
    if (e2) { await db.auth.admin.deleteUser(data.user.id); return j({ error: e2.message }, 400); }
    if (role === "admin") await db.from("admin_contacts").insert({ employee_id: emp, name: b.name, whatsapp: b.phone, email: b.email });
    return j({ ok: true });
  }

  const { data: t } = await db.from("profiles").select("id,role").eq("employee_id", emp).single();
  if (!t) return j({ error: "User not found" }, 404);
  if (!isSuper && t.role !== "teacher") return j({ error: "Admins can only manage Teachers" }, 403);

  if (b.action === "set_active") {
    if (t.role === "super_admin") return j({ error: "Super Admin cannot be deactivated" }, 403);
    await db.from("profiles").update({ is_active: !!b.active }).eq("id", t.id);
    await db.from("admin_contacts").update({ is_active: !!b.active }).eq("employee_id", emp);
    await db.auth.admin.updateUserById(t.id, { ban_duration: b.active ? "none" : "876000h" });
    return j({ ok: true });
  }
  return j({ error: "Unknown action" }, 400);
});
