// ============================================================
// STUDENT ATTENDANCE REGISTER
// SUPABASE EDGE FUNCTION: admin-users
// ============================================================
// Secure backend function for user management.
// Only accessible to authenticated users with role = 'ADMIN'.
// Uses the modern Supabase Edge Function standards.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_DOMAIN = "attendance.example.com";

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // 1. Client running in the caller's authenticated context
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid user session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify caller is an active ADMIN in profiles
    const { data: callerProfile, error: callerProfileError } = await userClient
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .single();

    if (
      callerProfileError ||
      !callerProfile ||
      !callerProfile.active ||
      callerProfile.role !== "ADMIN"
    ) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin privileges required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Admin client using service role key for administrative auth operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, employeeId, name, password, role, active, userId } = body;

    // --------------------------------------------------------
    // ACTION: listUsers
    // --------------------------------------------------------
    if (action === "listUsers") {
      const { data: profiles, error: listError } = await adminClient
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });

      if (listError) throw listError;

      return new Response(JSON.stringify({ users: profiles }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --------------------------------------------------------
    // ACTION: createUser
    // --------------------------------------------------------
    if (action === "createUser") {
      if (!employeeId || !name || !password) {
        return new Response(
          JSON.stringify({ error: "Missing required user fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanEmployeeId = employeeId.trim().toUpperCase();
      const email = `${cleanEmployeeId.toLowerCase()}@${EMAIL_DOMAIN}`;
      const userRole = role === "ADMIN" ? "ADMIN" : "USER";

      // Create authentication user
      const { data: createdAuth, error: createAuthError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { employee_id: cleanEmployeeId, name: name.trim() },
        });

      if (createAuthError) throw createAuthError;

      // Insert profile record
      const { data: newProfile, error: profileInsertError } = await adminClient
        .from("profiles")
        .insert({
          id: createdAuth.user.id,
          employee_id: cleanEmployeeId,
          name: name.trim(),
          role: userRole,
          active: true,
        })
        .select()
        .single();

      if (profileInsertError) {
        // Rollback created auth user if profile insertion fails
        await adminClient.auth.admin.deleteUser(createdAuth.user.id);
        throw profileInsertError;
      }

      return new Response(JSON.stringify({ user: newProfile }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --------------------------------------------------------
    // ACTION: updateUser
    // --------------------------------------------------------
    if (action === "updateUser") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Missing userId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updates: Record<string, any> = {};
      if (typeof name === "string") updates.name = name.trim();
      if (typeof role === "string" && ["ADMIN", "USER"].includes(role)) {
        updates.role = role;
      }
      if (typeof active === "boolean") updates.active = active;

      if (Object.keys(updates).length > 0) {
        const { error: updateProfileError } = await adminClient
          .from("profiles")
          .update(updates)
          .eq("id", userId);

        if (updateProfileError) throw updateProfileError;
      }

      if (password) {
        const { error: updatePasswordError } =
          await adminClient.auth.admin.updateUserById(userId, { password });

        if (updatePasswordError) throw updatePasswordError;
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --------------------------------------------------------
    // ACTION: deleteUser
    // --------------------------------------------------------
    if (action === "deleteUser") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Missing userId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (userId === user.id) {
        return new Response(
          JSON.stringify({ error: "You cannot delete your own account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteAuthError } =
        await adminClient.auth.admin.deleteUser(userId);

      if (deleteAuthError) throw deleteAuthError;

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});