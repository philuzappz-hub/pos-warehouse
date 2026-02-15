import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, handleOptions, json, requireAdmin } from "../_shared/utils.ts";

const VALID_ROLES = ["admin", "cashier", "warehouse", "staff"] as const;

type UpdateBody = {
  userId?: string;

  // role/branch updates
  role?: string;
  branch_id?: string;
  branchId?: string;

  // permission flags
  is_attendance_manager?: boolean;
  is_returns_handler?: boolean;
  isAttendanceManager?: boolean;
  isReturnsHandler?: boolean;
};

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status);

    const sbAdmin = adminClient();
    const body = (await req.json().catch(() => ({}))) as UpdateBody;

    const targetUserId = String(body.userId ?? "").trim();
    if (!targetUserId) return json({ ok: false, error: "Missing userId" }, 400);

    // block self updates here (safer)
    if (targetUserId === gate.userId) {
      return json({ ok: false, error: "You cannot edit yourself here" }, 400);
    }

    // Load target profile and enforce same company
    const { data: target, error: tErr } = await sbAdmin
      .from("profiles")
      .select("user_id, company_id, deleted_at")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (tErr) return json({ ok: false, error: tErr.message }, 500);
    if (!target) return json({ ok: false, error: "Target profile not found" }, 404);
    if ((target as any).deleted_at) {
      return json({ ok: false, error: "Target user is deleted/disabled" }, 400);
    }

    const targetCompanyId = (target as any).company_id ?? null;
    if (!targetCompanyId || String(targetCompanyId) !== String(gate.companyId)) {
      return json({ ok: false, error: "Cannot edit user outside your company" }, 403);
    }

    // Build updates
    const updates: Record<string, any> = {};
    const nowIso = new Date().toISOString();

    // role update
    if (body.role !== undefined) {
      const role = String(body.role).trim();
      if (!VALID_ROLES.includes(role as any)) {
        return json({ ok: false, error: "Invalid role" }, 400);
      }
      updates.role = role;
      updates.is_admin = role === "admin";
    }

    // branch update (accept branch_id OR branchId)
    if (body.branch_id !== undefined || body.branchId !== undefined) {
      const bIdRaw = body.branch_id ?? body.branchId;
      const bId = String(bIdRaw ?? "").trim();

      if (!bId) {
        updates.branch_id = null;
      } else {
        const { data: branch, error: bErr } = await sbAdmin
          .from("branches")
          .select("id, company_id, is_active")
          .eq("id", bId)
          .maybeSingle();

        if (bErr) return json({ ok: false, error: bErr.message }, 500);
        if (!branch) return json({ ok: false, error: "Branch not found" }, 404);
        if (!(branch as any).is_active) {
          return json({ ok: false, error: "Branch is not active" }, 400);
        }
        if (String((branch as any).company_id) !== String(gate.companyId)) {
          return json({ ok: false, error: "Branch does not belong to your company" }, 403);
        }

        updates.branch_id = bId;
      }
    }

    // flags update (accept snake_case OR camelCase)
    const attendance =
      body.is_attendance_manager ?? body.isAttendanceManager;
    const returnsHandler =
      body.is_returns_handler ?? body.isReturnsHandler;

    if (attendance !== undefined) updates.is_attendance_manager = Boolean(attendance);
    if (returnsHandler !== undefined) updates.is_returns_handler = Boolean(returnsHandler);

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: "Nothing to update" }, 400);
    }

    updates.updated_at = nowIso;

    const { data: updatedRows, error: upErr, count } = await sbAdmin
      .from("profiles")
      .update(updates as any)
      .eq("user_id", targetUserId)
      .select("user_id", { count: "exact" });

    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    const updated = Number(count ?? (updatedRows?.length ?? 0));
    if (!updated) return json({ ok: false, error: "No rows updated" }, 400);

    return json({ ok: true, updated }, 200);
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
