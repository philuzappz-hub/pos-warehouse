import { adminClient, handleOptions, json, requireAdmin } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status);

    const sbAdmin = adminClient();

    // Get branches for this company
    const { data: branches, error: bErr } = await sbAdmin
      .from("branches")
      .select("id")
      .eq("company_id", gate.companyId);

    if (bErr) return json({ ok: false, error: bErr.message }, 500);

    const branchIds = (branches ?? []).map((b: any) => String(b.id));
    if (branchIds.length === 0) return json({ ok: true, repaired: 0 }, 200);

    const nowIso = new Date().toISOString();

    // ✅ Bulk repair in one update
    const { data: updatedRows, error: upErr, count } = await sbAdmin
      .from("profiles")
      .update({ company_id: gate.companyId, updated_at: nowIso } as any)
      .is("company_id", null)
      .in("branch_id", branchIds as any)
      .select("user_id", { count: "exact" });

    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    const repaired = Number(count ?? (updatedRows?.length ?? 0));
    return json({ ok: true, repaired }, 200);
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
