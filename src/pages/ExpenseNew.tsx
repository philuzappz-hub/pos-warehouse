import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { ArrowLeft, Plus } from "lucide-react";

interface ExpenseCategory {
  id: string;
  name: string;
}

interface BranchPick {
  id: string;
  name: string;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function safeText(v: any) {
  return (v ?? "").toString().trim();
}

export default function ExpenseNew() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    user,
    profile,
    activeBranchId,
    isAdmin,
    isReturnsHandler,
    roles,
    branchName,
    loading: authLoading,
  } = useAuth() as any;

  const isCashier = Array.isArray(roles) && roles.includes("cashier");

  // ✅ Access control: ONLY admin + cashier can create expenses
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    // returns handler must never create
    if (isReturnsHandler) {
      toast({
        title: "Not allowed",
        description: "Returns handlers cannot create expenses.",
        variant: "destructive",
      });
      navigate("/expenses", { replace: true });
      return;
    }

    // only admin + cashier allowed
    if (!isAdmin && !isCashier) {
      toast({
        title: "Not allowed",
        description: "You do not have permission to create expenses.",
        variant: "destructive",
      });
      navigate("/expenses", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin, isCashier, isReturnsHandler]);

  const [loading, setLoading] = useState(false);

  // Form
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => isoDate(new Date()));
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [vendorName, setVendorName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(""); // optional; DB default is 'cash'

  // Meta
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [branches, setBranches] = useState<BranchPick[]>([]);
  const [manualBranchId, setManualBranchId] = useState<string>("");

  const needsBranchPick = useMemo(() => {
    // branch_id is required in DB.
    // Cashier should already have profile.branch_id
    // Admin on "All branches" must choose a branch explicitly
    if (!isAdmin) return false;
    return !activeBranchId;
  }, [isAdmin, activeBranchId]);

  const resolvedBranchId = useMemo(() => {
    if (activeBranchId) return activeBranchId;

    // cashier: must use their assigned branch
    if (!isAdmin) return profile?.branch_id ?? null;

    // admin and all-branches view -> must pick
    return manualBranchId || null;
  }, [activeBranchId, isAdmin, profile?.branch_id, manualBranchId]);

  const headerBranchLabel = useMemo(() => {
    if (activeBranchId) return (branchName ?? "").trim() || "Selected branch";
    if (!isAdmin) return (branchName ?? "").trim() || "Your branch";
    return "All branches (choose one)";
  }, [activeBranchId, isAdmin, branchName]);

  const loadMeta = async () => {
    if (!profile?.company_id) return;

    // categories
    const { data: cats, error: catErr } = await (supabase as any)
      .from("expense_categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (!catErr && Array.isArray(cats)) {
      setCategories(
        cats.map((c: any) => ({ id: String(c.id), name: c.name ?? "—" }))
      );
    } else {
      setCategories([]);
    }

    // branches for admin branch pick
    if (needsBranchPick) {
      const { data: brs, error: brErr } = await (supabase as any)
        .from("branches")
        .select("id, name")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!brErr && Array.isArray(brs)) {
        setBranches(
          brs.map((b: any) => ({ id: String(b.id), name: b.name ?? "—" }))
        );
      } else {
        setBranches([]);
      }
    } else {
      setBranches([]);
    }
  };

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, needsBranchPick]);

  const submit = async () => {
    if (!user || !profile?.company_id) return;

    // ✅ hard block in submit too (not just in useEffect)
    if (isReturnsHandler || (!isAdmin && !isCashier)) {
      toast({
        title: "Not allowed",
        description: "You do not have permission to create expenses.",
        variant: "destructive",
      });
      return;
    }

    const amt = Number(amount);
    if (!title.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast({
        title: "Invalid input",
        description: "Enter a title and a valid amount greater than 0.",
        variant: "destructive",
      });
      return;
    }

    if (!resolvedBranchId) {
      toast({
        title: "Branch required",
        description: "Please select a branch to submit this expense under.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        title: title.trim(),
        amount: amt,
        company_id: profile.company_id,
        branch_id: resolvedBranchId,
        created_by: user.id,
        status: "submitted",
        expense_date: expenseDate || isoDate(new Date()),
        description: safeText(description) ? safeText(description) : null,
        category_id: categoryId ? categoryId : null,
        vendor_name: safeText(vendorName) ? safeText(vendorName) : null,
        reference_no: safeText(referenceNo) ? safeText(referenceNo) : null,
        receipt_url: safeText(receiptUrl) ? safeText(receiptUrl) : null,
      };

      // payment_method is enum; keep empty to let DB default apply
      if (safeText(paymentMethod)) payload.payment_method = safeText(paymentMethod);

      const { error } = await (supabase as any).from("expenses").insert(payload);
      if (error) throw error;

      toast({ title: "Expense submitted" });
      navigate("/expenses");
    } catch (e: any) {
      toast({
        title: "Submit failed",
        description: e?.message || "Failed to submit expense",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">New Expense</h1>
          <p className="text-slate-400">
            Submitting to •{" "}
            <span className="text-slate-300">{headerBranchLabel}</span>
          </p>
        </div>

        <Button variant="secondary" onClick={() => navigate("/expenses")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Submit Expense
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {needsBranchPick && (
            <div className="space-y-2">
              <Label className="text-slate-200">Branch</Label>
              <select
                value={manualBranchId}
                onChange={(e) => setManualBranchId(e.target.value)}
                className="h-10 w-full rounded-md bg-slate-700 border border-slate-600 text-white px-3"
              >
                <option value="">— Select branch —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">
                Admin is on <span className="text-slate-200">All branches</span>. Choose a branch
                for this record.
              </p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-200">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. VAT, Salary Advance, Petty Cash"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-200">Amount</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Expense Date</Label>
                <Input
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  type="date"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-slate-200">Category</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 w-full rounded-md bg-slate-700 border border-slate-600 text-white px-3"
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">
                (Optional) If categories are empty, create them in{" "}
                <span className="text-slate-200">expense_categories</span>.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Payment Method</Label>
              <Input
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Leave empty for default (cash)"
                className="bg-slate-700 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-400">
                Keep empty to use DB default. If your enum is strict, type an exact valid value.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Vendor / Payee</Label>
              <Input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. ECG, Supplier name"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-200">Reference No</Label>
              <Input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Receipt no / transaction ref"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Receipt URL</Label>
              <Input
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder="https://..."
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short details..."
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate("/expenses")} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}