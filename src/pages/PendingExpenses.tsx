import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import {
    ArrowLeft,
    CheckCircle,
    Pencil,
    RefreshCw,
    Trash2,
    XCircle,
} from "lucide-react";

type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | string;

interface ExpenseRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;

  amount: number;
  expense_date: string;
  payment_method: string;
  vendor_name: string | null;
  reference_no: string | null;
  receipt_url: string | null;

  status: ExpenseStatus;
  branch_id: string;
  company_id: string | null;

  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;

  created_at: string;
}

interface CreatorInfo {
  full_name: string;
  staff_code: string | null;
  user_id: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
}

interface ExpenseWithMeta extends ExpenseRow {
  creator?: CreatorInfo | null;
  branch_name?: string | null;
  category_name?: string | null;
}

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusBadgeVariant(status: ExpenseStatus) {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  if (status === "submitted") return "secondary";
  return "secondary";
}

function statusLabel(status: ExpenseStatus) {
  if (status === "approved") return "Paid";
  if (status === "submitted") return "Submitted";
  if (status === "rejected") return "Rejected";
  if (status === "draft") return "Draft";
  return String(status);
}

function safeText(v: any) {
  return (v ?? "").toString().trim();
}

export default function PendingExpenses() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    user,
    profile,
    activeBranchId,
    isAdmin,
    isReturnsHandler,
    roles,
  } = useAuth() as any;

  const isCashier = Array.isArray(roles) && roles.includes("cashier");
  const isApprover = isAdmin || isReturnsHandler;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExpenseWithMeta[]>([]);
  const [search, setSearch] = useState("");

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Review (approve/reject)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ExpenseWithMeta | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Edit (admin OR cashier-owner only)
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseWithMeta | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    amount: "",
    expense_date: "",
    description: "",
    category_id: "",
    vendor_name: "",
    reference_no: "",
    receipt_url: "",
    payment_method: "",
  });

  const isPendingStatus = (s: ExpenseStatus) => s === "submitted" || s === "draft";

  // ✅ Permission rules
  const canCashierEditOwnPending = (exp: ExpenseWithMeta) =>
    isCashier && exp.created_by === user?.id && isPendingStatus(exp.status);

  // Admin can edit any pending (submitted/draft). Returns handler cannot edit at all.
  const canAdminEditPending = (exp: ExpenseWithMeta) =>
    isAdmin && isPendingStatus(exp.status);

  const canEditPending = (exp: ExpenseWithMeta) =>
    (canCashierEditOwnPending(exp) || canAdminEditPending(exp)) && !isReturnsHandler;

  // ✅ Delete: cashier-owner only (admin cannot delete; returns handler cannot delete)
  const canDeletePending = (exp: ExpenseWithMeta) =>
    isCashier && exp.created_by === user?.id && isPendingStatus(exp.status);

  const loadCategories = async () => {
    const { data: cats, error } = await (supabase as any)
      .from("expense_categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (!error && Array.isArray(cats)) {
      setCategories(cats.map((c: any) => ({ id: String(c.id), name: c.name ?? "—" })));
    } else {
      setCategories([]);
    }
  };

  const fetchPending = async () => {
    if (!user || !profile?.company_id) return;

    setLoading(true);
    try {
      // Only submitted (pending queue)
      let q = (supabase as any)
        .from("expenses")
        .select(
          `
          id,
          title,
          description,
          category_id,
          amount,
          expense_date,
          payment_method,
          vendor_name,
          reference_no,
          receipt_url,
          status,
          branch_id,
          company_id,
          created_by,
          approved_by,
          approved_at,
          rejected_reason,
          created_at
        `
        )
        .eq("company_id", profile.company_id)
        .eq("status", "submitted")
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (activeBranchId) q = q.eq("branch_id", activeBranchId);

      const { data: expenses, error: expErr } = await q;
      if (expErr) throw expErr;

      const expenseList: ExpenseRow[] = (expenses ?? []) as ExpenseRow[];

      // creators
      const creatorIds = Array.from(
        new Set(expenseList.map((e) => e.created_by).filter(Boolean))
      );

      const creatorsMap = new Map<string, CreatorInfo>();
      if (creatorIds.length > 0) {
        const { data: creators, error: crErr } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name, staff_code")
          .in("user_id", creatorIds)
          .is("deleted_at", null);

        if (crErr) throw crErr;

        (creators ?? []).forEach((c: any) => {
          creatorsMap.set(String(c.user_id), {
            user_id: String(c.user_id),
            full_name: c.full_name ?? "Unknown",
            staff_code: c.staff_code ?? null,
          });
        });
      }

      // branch names only when viewing all branches
      const branchIds = Array.from(
        new Set(expenseList.map((e) => e.branch_id).filter(Boolean))
      );

      const branchMap = new Map<string, string>();
      if (!activeBranchId && branchIds.length > 0) {
        const { data: branches, error: brErr } = await (supabase as any)
          .from("branches")
          .select("id, name")
          .in("id", branchIds);

        if (brErr) throw brErr;

        (branches ?? []).forEach((b: any) => {
          branchMap.set(String(b.id), String(b.name ?? ""));
        });
      }

      // categories map
      const catMap = new Map<string, string>();
      categories.forEach((c) => catMap.set(c.id, c.name));

      const merged: ExpenseWithMeta[] = expenseList.map((e) => ({
        ...e,
        creator: creatorsMap.get(e.created_by) ?? null,
        branch_name: !activeBranchId ? branchMap.get(e.branch_id) ?? null : null,
        category_name: e.category_id ? catMap.get(String(e.category_id)) ?? null : null,
      }));

      setRows(merged);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load pending expenses",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  useEffect(() => {
    fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, activeBranchId, categories.length]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const createdBy =
        (r.creator?.full_name ?? "") + " " + (r.creator?.staff_code ?? "");
      const branch = r.branch_name ?? "";
      const cat = r.category_name ?? "";
      const vendor = r.vendor_name ?? "";
      const ref = r.reference_no ?? "";

      const hay = `${r.title} ${createdBy} ${branch} ${cat} ${vendor} ${ref}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, search]);

  const openReview = (exp: ExpenseWithMeta) => {
    setReviewTarget(exp);
    setRejectReason("");
    setReviewOpen(true);
  };

  const approve = async () => {
    if (!user || !reviewTarget) return;

    if (!isApprover) {
      toast({
        title: "Not allowed",
        description: "You do not have permission to approve expenses.",
        variant: "destructive",
      });
      return;
    }

    if (reviewTarget.created_by === user.id) {
      toast({
        title: "Not allowed",
        description: "You cannot approve your own expense.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from("expenses")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejected_reason: null,
        })
        .eq("id", reviewTarget.id);

      if (error) throw error;

      toast({ title: "Approved (auto-paid)" });
      setReviewOpen(false);
      setReviewTarget(null);
      fetchPending();
    } catch (e: any) {
      toast({
        title: "Approve failed",
        description: e?.message || "Failed to approve",
        variant: "destructive",
      });
    }
  };

  const reject = async () => {
    if (!user || !reviewTarget) return;

    if (!isApprover) {
      toast({
        title: "Not allowed",
        description: "You do not have permission to reject expenses.",
        variant: "destructive",
      });
      return;
    }

    if (reviewTarget.created_by === user.id) {
      toast({
        title: "Not allowed",
        description: "You cannot reject your own expense.",
        variant: "destructive",
      });
      return;
    }

    if (!safeText(rejectReason)) {
      toast({
        title: "Reason required",
        description: "Please provide a rejection reason.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from("expenses")
        .update({
          status: "rejected",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejected_reason: safeText(rejectReason),
        })
        .eq("id", reviewTarget.id);

      if (error) throw error;

      toast({ title: "Rejected" });
      setReviewOpen(false);
      setReviewTarget(null);
      fetchPending();
    } catch (e: any) {
      toast({
        title: "Reject failed",
        description: e?.message || "Failed to reject",
        variant: "destructive",
      });
    }
  };

  const openEdit = (exp: ExpenseWithMeta) => {
    setEditTarget(exp);
    setEditForm({
      title: exp.title ?? "",
      amount: String(exp.amount ?? ""),
      expense_date: exp.expense_date ?? "",
      description: exp.description ?? "",
      category_id: exp.category_id ?? "",
      vendor_name: exp.vendor_name ?? "",
      reference_no: exp.reference_no ?? "",
      receipt_url: exp.receipt_url ?? "",
      payment_method: exp.payment_method ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!user || !editTarget) return;

    // ✅ enforce permissions server-side (not only UI)
    if (!canEditPending(editTarget)) {
      toast({
        title: "Not allowed",
        description: "You do not have permission to edit this expense.",
        variant: "destructive",
      });
      return;
    }

    const amt = Number(editForm.amount);
    if (!safeText(editForm.title) || !Number.isFinite(amt) || amt <= 0) {
      toast({
        title: "Invalid input",
        description: "Enter a title and a valid amount greater than 0.",
        variant: "destructive",
      });
      return;
    }

    try {
      const payload: any = {
        title: safeText(editForm.title),
        amount: amt,
        expense_date: editForm.expense_date,
        description: safeText(editForm.description) ? safeText(editForm.description) : null,
        category_id: editForm.category_id ? editForm.category_id : null,
        vendor_name: safeText(editForm.vendor_name) ? safeText(editForm.vendor_name) : null,
        reference_no: safeText(editForm.reference_no) ? safeText(editForm.reference_no) : null,
        receipt_url: safeText(editForm.receipt_url) ? safeText(editForm.receipt_url) : null,
      };

      // keep enum safe: only update if non-empty
      if (safeText(editForm.payment_method)) {
        payload.payment_method = safeText(editForm.payment_method);
      }

      const { error } = await (supabase as any)
        .from("expenses")
        .update(payload)
        .eq("id", editTarget.id);

      if (error) throw error;

      toast({ title: "Updated" });
      setEditOpen(false);
      setEditTarget(null);
      fetchPending();
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e?.message || "Failed to update expense",
        variant: "destructive",
      });
    }
  };

  const deleteExpense = async (exp: ExpenseWithMeta) => {
    if (!user) return;

    // ✅ enforce delete rules: cashier-owner only
    if (!canDeletePending(exp)) {
      toast({
        title: "Not allowed",
        description: "Only the cashier who created it can delete before approval.",
        variant: "destructive",
      });
      return;
    }

    const ok = confirm(`Delete "${exp.title}"? This cannot be undone.`);
    if (!ok) return;

    try {
      const { error } = await (supabase as any).from("expenses").delete().eq("id", exp.id);
      if (error) throw error;

      toast({ title: "Deleted" });
      fetchPending();
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message || "Failed to delete",
        variant: "destructive",
      });
    }
  };

  const showBranchColumn = !activeBranchId;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Pending Expenses</h1>
          <p className="text-slate-400">
            Submitted expenses awaiting review (separate from history).
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="secondary" onClick={fetchPending} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6 space-y-3">
          <div className="space-y-2">
            <Label className="text-slate-200">Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, staff, branch, vendor..."
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>

          <p className="text-xs text-slate-400">
            • Approvers (Admin / Returns Handler) can approve or reject.
            • Cashiers can edit/delete only their own pending expenses before approval.
            • Returns Handler cannot edit or delete expenses.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Title</TableHead>
                {showBranchColumn && (
                  <TableHead className="text-slate-400">Branch</TableHead>
                )}
                <TableHead className="text-slate-400">Category</TableHead>
                <TableHead className="text-slate-400">Amount</TableHead>
                <TableHead className="text-slate-400">Date</TableHead>
                <TableHead className="text-slate-400">Created By</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((exp) => {
                const approverCanReview =
                  isApprover && exp.created_by !== user?.id && exp.status === "submitted";

                const canEdit = canEditPending(exp);
                const canDelete = canDeletePending(exp);

                return (
                  <TableRow key={exp.id} className="border-slate-700">
                    <TableCell className="text-white">
                      <div className="font-medium">{exp.title}</div>
                      {(exp.vendor_name || exp.reference_no || exp.receipt_url) && (
                        <div className="text-xs text-slate-400 mt-1">
                          {exp.vendor_name ? (
                            <span className="mr-2">Vendor: {exp.vendor_name}</span>
                          ) : null}
                          {exp.reference_no ? (
                            <span className="mr-2">Ref: {exp.reference_no}</span>
                          ) : null}
                          {exp.receipt_url ? (
                            <a
                              href={exp.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-300 underline"
                            >
                              Receipt
                            </a>
                          ) : null}
                        </div>
                      )}
                    </TableCell>

                    {showBranchColumn && (
                      <TableCell className="text-slate-300">{exp.branch_name ?? "—"}</TableCell>
                    )}

                    <TableCell className="text-slate-300">{exp.category_name ?? "—"}</TableCell>

                    <TableCell className="text-slate-300">GHC {money(exp.amount)}</TableCell>

                    <TableCell className="text-slate-300">{exp.expense_date}</TableCell>

                    <TableCell className="text-slate-300">
                      {exp.creator?.full_name ?? "—"}
                      {exp.creator?.staff_code ? (
                        <span className="text-xs text-slate-500 ml-1">
                          ({exp.creator.staff_code})
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <Badge variant={statusBadgeVariant(exp.status)}>
                        {statusLabel(exp.status)}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {approverCanReview ? (
                          <Button size="sm" onClick={() => openReview(exp)}>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        ) : null}

                        {canEdit ? (
                          <Button size="sm" variant="secondary" onClick={() => openEdit(exp)}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        ) : null}

                        {canDelete ? (
                          <Button size="sm" variant="destructive" onClick={() => deleteExpense(exp)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        ) : null}

                        {!approverCanReview && !canEdit && !canDelete ? (
                          <span className="text-slate-500 text-sm">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showBranchColumn ? 8 : 7}
                    className="text-center text-slate-400 py-8"
                  >
                    No pending expenses
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell
                    colSpan={showBranchColumn ? 8 : 7}
                    className="text-center text-slate-400 py-8"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review dialog (approve/reject) */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Review Expense</DialogTitle>
          </DialogHeader>

          {reviewTarget ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300">
                <div className="font-semibold text-white">{reviewTarget.title}</div>
                <div>Amount: GHC {money(reviewTarget.amount)}</div>
                <div>Date: {reviewTarget.expense_date}</div>
                {reviewTarget.vendor_name ? <div>Vendor: {reviewTarget.vendor_name}</div> : null}
                {reviewTarget.reference_no ? <div>Ref: {reviewTarget.reference_no}</div> : null}
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Reject Reason (required if rejecting)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Missing receipt, wrong amount, not authorized..."
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>
              Close
            </Button>
            <Button variant="destructive" onClick={reject}>
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button onClick={approve}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (Admin OR cashier-owner only) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Edit Pending Expense</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-2">
              <Label className="text-slate-200">Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-200">Amount</Label>
                <Input
                  value={editForm.amount}
                  onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                  type="number"
                  inputMode="decimal"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Date</Label>
                <Input
                  value={editForm.expense_date}
                  onChange={(e) => setEditForm((p) => ({ ...p, expense_date: e.target.value }))}
                  type="date"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-200">Category</Label>
                <select
                  value={editForm.category_id}
                  onChange={(e) => setEditForm((p) => ({ ...p, category_id: e.target.value }))}
                  className="h-10 w-full rounded-md bg-slate-800 border border-slate-700 text-white px-3"
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Payment Method</Label>
                <Input
                  value={editForm.payment_method}
                  onChange={(e) => setEditForm((p) => ({ ...p, payment_method: e.target.value }))}
                  placeholder="Leave as-is or type exact enum value"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-200">Vendor / Payee</Label>
                <Input
                  value={editForm.vendor_name}
                  onChange={(e) => setEditForm((p) => ({ ...p, vendor_name: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Reference No</Label>
                <Input
                  value={editForm.reference_no}
                  onChange={(e) => setEditForm((p) => ({ ...p, reference_no: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-200">Receipt URL</Label>
                <Input
                  value={editForm.receipt_url}
                  onChange={(e) => setEditForm((p) => ({ ...p, receipt_url: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}