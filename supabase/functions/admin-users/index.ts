// Supabase Edge Function: admin-users
// Securely manages user creation, updates, and deletions for administrators.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_DOMAIN = "attendance.example.com";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration in environment variables.");
    }

    // 1. Authenticate caller using their Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired session." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Initialize Admin client with service_role privileges
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller has active ADMIN privileges
    const { data: callerProfile, error: profileCheckError } = await adminClient
      .from("profiles")
      .select("role, active")
      .eq("id", callerUser.id)
      .single();

    if (
      profileCheckError ||
      !callerProfile ||
      !callerProfile.active ||
      callerProfile.role !== "ADMIN"
    ) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Only active Administrators can perform this action." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Process the requested action
    const body = await req.json().catch(() => ({}));
    const action = body.action || body.type;

    // --- CREATE NEW USER ---
    if (action === "create" || action === "createUser") {
      const employeeId = (body.employee_id || body.employeeId || "").trim().toUpperCase();
      const name = (body.name || "").trim();
      const role = body.role === "ADMIN" ? "ADMIN" : "USER";
      const password = body.password;

      if (!employeeId || !name || !password || password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Employee ID, Name, and a Password of at least 6 characters are required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const email = `${employeeId.toLowerCase()}@${EMAIL_DOMAIN}`;

      // Create identity in Supabase Auth
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_id: employeeId, name },
      });

      if (createError) throw createError;

      // Upsert profile record
      const { error: profileError } = await adminClient.from("profiles").upsert(
        {
          id: newUser.user.id,
          employee_id: employeeId,
          name: name,
          role: role,
          active: true,
        },
        { onConflict: "id" }
      );

      if (profileError) {
        // Rollback created auth record if profile insertion fails
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        throw profileError;
      }

      return new Response(JSON.stringify({ success: true, user: newUser.user }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- UPDATE / RESET PASSWORD ---
    if (action === "updateUser" || action === "resetPassword") {
      const targetUserId = body.userId || body.id;
      const newPassword = body.password;

      if (!targetUserId || !newPassword || newPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: "Target userId and a new password (min 6 characters) are required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true, message: "Password updated successfully." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- DELETE USER ---
    if (action === "delete" || action === "deleteUser") {
      const targetUserId = body.userId || body.id;

      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "Target userId is required for deletion." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Safeguard primary administrator
      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("employee_id")
        .eq("id", targetUserId)
        .single();

      if (targetProfile?.employee_id === "241536") {
        return new Response(
          JSON.stringify({ error: "Cannot delete the primary Super Administrator." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clean up relations and profile
      await adminClient.from("teacher_batches").delete().eq("profile_id", targetUserId);
      await adminClient.from("profiles").delete().eq("id", targetUserId);

      // Remove from auth schema
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true, message: "User account deleted successfully." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});