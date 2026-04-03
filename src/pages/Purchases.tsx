import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PurchaseStatsCards from "@/features/purchases/components/PurchaseStatsCards";
import PurchasesTable from "@/features/purchases/components/PurchasesTable";
import { getPurchaseStats } from "@/features/purchases/helpers";
import { fetchPurchases, fetchPurchaseSuppliers } from "@/features/purchases/services";
import type { PurchaseRow, SupplierOption } from "@/features/purchases/types";
import type { BranchRow } from "@/features/reports/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";

export default function Purchases() {
  const { toast } = useToast();
  const { profile, activeBranchId } = useAuth() as any;

  const companyId = profile?.company_id ?? null;

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadBranches = async () => {
    if (!companyId) return;

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await (supabase as any)
      .from("branches")
      .select("id,name,address,phone,email,company_id,is_active")
      .eq("company_id", companyId)
      .order("name");

    if (error) throw error;
    setBranches((data ?? []) as BranchRow[]);
  };

  const loadSuppliers = async () => {
    if (!companyId) {
      setSuppliers([]);
      return;
    }

    const rows = await fetchPurchaseSuppliers(companyId);
    setSuppliers(rows);
  };

  const loadPurchases = async () => {
    if (!companyId) {
      setPurchases([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await fetchPurchases({
        companyId,
        branchId: branchFilter === "all" ? null : branchFilter,
        supplierId: supplierFilter === "all" ? null : supplierFilter,
        paymentStatus: paymentStatusFilter === "all" ? null : paymentStatusFilter,
        startDate: startDate || null,
        endDate: endDate || null,
      });

      setPurchases(rows);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load purchases.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await loadBranches();
        await loadSuppliers();
      } catch (e: any) {
        toast({
          title: "Setup failed",
          description: e?.message || "Could not load purchase setup data.",
          variant: "destructive",
        });
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (activeBranchId && branchFilter === "all") {
      setBranchFilter("all");
    }
  }, [activeBranchId]);

  useEffect(() => {
    void loadPurchases();
  }, [companyId, branchFilter, supplierFilter, paymentStatusFilter, startDate, endDate]);

  const stats = useMemo(() => getPurchaseStats(purchases), [purchases]);

  const totalCreditApplied = useMemo(
    () =>
      purchases.reduce(
        (sum, row) => sum + Number(row.supplier_credit_applied || 0),
        0
      ),
    [purchases]
  );

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Purchases</h1>
          <p className="text-slate-300">
            Track supplier purchases, paid amounts, supplier credit used, outstanding balances, and overpayments.
          </p>
        </div>

        <Button asChild className="w-full sm:w-auto font-semibold">
          <a href="/purchases/new">New Purchase</a>
        </Button>
      </div>

      <PurchaseStatsCards stats={stats} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-cyan-700/40 bg-slate-900 shadow-sm">
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-300">Supplier Credit Applied</div>
            <div className="mt-2 text-3xl font-bold text-cyan-300">
              GHS {totalCreditApplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Credit auto-used from supplier overpayments on purchases in this view.
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-700/30 bg-slate-900 shadow-sm xl:col-span-2">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-300">
              Purchases can now use existing supplier credit automatically before adding new payable balance.
              Any extra cash above the remaining amount becomes a new overpayment credit.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-600 bg-slate-900 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-slate-200">Branch</Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Payment Status</Label>
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-white">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-slate-600 bg-slate-800 text-white"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadPurchases()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setBranchFilter("all");
                setSupplierFilter("all");
                setPaymentStatusFilter("all");
                setStartDate("");
                setEndDate("");
              }}
            >
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <PurchasesTable purchases={purchases} branches={branches} />
    </div>
  );
}