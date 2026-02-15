import { adminClient, handleOptions, json, requireAdmin } from "../_shared/utils.ts";

const VALID_ROLES = ["admin", "cashier", "warehouse", "staff"] as const;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status);

    const body = await req.json().catch(() => ({}));

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? body.fullName ?? "").trim();
    const phone = body.phone ? String(body.phone).trim() : null;
    const role = String(body.role ?? "staff").trim();
    const branchId = String(body.branch_id ?? body.branchId ?? "").trim();

    if (!email || !password || !fullName) {
      return json({ ok: false, error: "email, password, full_name are required" }, 400);
    }
    if (password.length < 6) {
      return json({ ok: false, error: "Password must be at least 6 characters" }, 400);
    }
    if (!VALID_ROLES.includes(role as any)) {
      return json({ ok: false, error: "Invalid role" }, 400);
    }
    if (!branchId) {
      return json({ ok: false, error: "branch_id is required" }, 400);
    }

    const sbAdmin = adminClient();

    // Ensure branch belongs to admin's company
    const { data: branch, error: bErr } = await sbAdmin
      .from("branches")
      .select("id, company_id, is_active")
      .eq("id", branchId)
      .maybeSingle();

    if (bErr) return json({ ok: false, error: bErr.message }, 500);
    if (!branch) return json({ ok: false, error: "Branch not found" }, 404);
    if (!(branch as any).is_active) return json({ ok: false, error: "Branch is not active" }, 400);
    if (String((branch as any).company_id) !== String(gate.companyId)) {
      return json({ ok: false, error: "Branch does not belong to your company" }, 403);
    }

    // Create auth user
    const { data: created, error: cErr } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    if (cErr) return json({ ok: false, error: cErr.message }, 400);

    const newUserId = created?.user?.id;
    if (!newUserId) return json({ ok: false, error: "User creation failed" }, 500);

    // Create profile row
    const { error: pErr } = await sbAdmin.from("profiles").upsert(
      {
        user_id: newUserId,
        full_name: fullName,
        phone,
        role,
        branch_id: branchId,
        company_id: gate.companyId,
        is_admin: role === "admin",
        deleted_at: null,
        deleted_by: null,
        deleted_reason: null,
      } as any,
      { onConflict: "user_id" }
    );

    if (pErr) {
      // rollback auth user
      await sbAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      return json({ ok: false, error: pErr.message }, 500);
    }

    return json({ ok: true, user_id: newUserId }, 200);
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
