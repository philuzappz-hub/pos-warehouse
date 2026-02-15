import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

function j(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  // ✅ Must be signed in (reads Authorization Bearer token)
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { userId } = auth;

  // ✅ Admin/service client
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");

  if (!url) return j(500, { message: "Missing SUPABASE_URL" });
  if (!serviceKey) return j(500, { message: "Missing service role key" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ✅ Load caller profile (need admin + company_id)
  const { data: me, error: meErr } = await admin
    .from("profiles")
    .select("user_id, is_admin, role, deleted_at, company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (meErr) return j(500, { message: meErr.message });
  const isAdmin =
    !!me && me.deleted_at == null && (me.is_admin === true || me.role === "admin");

  if (!isAdmin) return j(403, { message: "Forbidden" });

  const myCompanyId = (me as any)?.company_id ?? null;
  if (!myCompanyId) return j(400, { message: "Your account has no company_id yet" });

  const body = await req.json().catch(() => ({}));
  const targetUserId = String(body?.userId || "");
  const mode = String(body?.mode || "soft"); // "soft" | "hard"
  const reason = String(body?.reason || "Deleted by admin");

  if (!targetUserId) return j(400, { message: "Missing userId" });
  if (targetUserId === userId) return j(400, { message: "You cannot delete yourself" });

  // ✅ Ensure target is in same company (prevents cross-company delete)
  const { data: target, error: tErr } = await admin
    .from("profiles")
    .select("user_id, company_id, deleted_at")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (tErr) return j(500, { message: tErr.message });
  if (!target) return j(404, { message: "Target profile not found" });

  const targetCompanyId = (target as any)?.company_id ?? null;
  if (!targetCompanyId || targetCompanyId !== myCompanyId) {
    return j(403, { message: "Cannot delete user outside your company" });
  }

  // ✅ SOFT delete (recommended)
  const nowIso = new Date().toISOString();

  const { data: updatedRows, error: upErr, count } = await admin
    .from("profiles")
    .update({
      deleted_at: nowIso,
      deleted_by: userId,
      deleted_reason: reason,
      updated_at: nowIso,
    })
    .eq("user_id", targetUserId)
    .is("deleted_at", null)
    .select("user_id", { count: "exact" });

  if (upErr) return j(500, { message: upErr.message });
  const updated = Number(count ?? (updatedRows?.length ?? 0));

  if (!updated) {
    return j(404, { message: "User already deleted (or not found)" });
  }

  // ✅ Optional HARD delete (also delete from auth.users)
  if (mode === "hard") {
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) return j(500, { message: `Soft deleted, but auth delete failed: ${delErr.message}` });
  }

  return j(200, { ok: true, updated, mode });
});
