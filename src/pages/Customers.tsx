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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Pencil, Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes?: string | null;
  is_active: boolean;
  branch_id?: string | null;
  company_id?: string;
  created_at: string;
  updated_at?: string;
};

type CustomerSale = {
  id: string;
  receipt_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: number;
  status: string;
  created_at: string;
  is_returned?: boolean | null;
  branch_id?: string | null;
};

type CustomerStats = {
  totalPurchases: number;
  grossPurchases: number;
  totalReturns: number;
  netPurchase: number;
  lastPurchaseAt: string | null;
};

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Customers() {
  const { profile, activeBranchId, branchId } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [customerStats, setCustomerStats] = useState<Record<string, CustomerStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [historySales, setHistorySales] = useState<CustomerSale[]>([]);

  const companyId = (profile as any)?.company_id ?? null;
  const currentBranchId = activeBranchId || branchId || null;

  const resetForm = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setEditingCustomer(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setOpen(true);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFullName(customer.full_name || "");
    setPhone(customer.phone || "");
    setEmail(customer.email || "");
    setAddress(customer.address || "");
    setOpen(true);
  };

  const isValidSaleRow = (row: any) => {
    if (!row) return false;
    if (row?.is_returned) return false;

    const status = String(row?.status || "").toLowerCase();
    if (status === "cancelled" || status === "returned") return false;

    if (currentBranchId && String(row?.branch_id || "") !== String(currentBranchId)) {
      return false;
    }

    return true;
  };

  const isApprovedReturnRow = (row: any) => {
    if (!row) return false;

    const status = String(row?.status || "").toLowerCase();
    if (status !== "approved") return false;

    if (currentBranchId && String(row?.branch_id || "") !== String(currentBranchId)) {
      return false;
    }

    return true;
  };

  const loadCustomers = async () => {
    if (!companyId) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await (supabase as any)
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .order("full_name");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load customers",
        variant: "destructive",
      });
      setCustomers([]);
    } else {
      setCustomers((data || []) as Customer[]);
    }

    setLoading(false);
  };

  const loadCustomerStats = async (list: Customer[]) => {
    if (!companyId || list.length === 0) {
      setCustomerStats({});
      return;
    }

    setStatsLoading(true);

    try {
      const customerIds = list.map((c) => c.id);

      const [salesRes, returnsRes] = await Promise.all([
        (supabase as any)
          .from("sales")
          .select("id,customer_id,total_amount,created_at,status,is_returned,branch_id")
          .eq("company_id", companyId)
          .in("customer_id", customerIds),

        (supabase as any)
          .from("returns")
          .select(
            `
              id,
              sale_id,
              sale_item_id,
              quantity,
              status,
              branch_id,
              sale:sales ( id, customer_id ),
              sale_item:sale_items ( id, unit_price )
            `
          )
          .eq("company_id", companyId)
          .eq("status", "approved"),
      ]);

      if (salesRes.error) {
        setCustomerStats({});
        setStatsLoading(false);
        return;
      }

      const statsMap: Record<string, CustomerStats> = {};

      for (const c of list) {
        statsMap[c.id] = {
          totalPurchases: 0,
          grossPurchases: 0,
          totalReturns: 0,
          netPurchase: 0,
          lastPurchaseAt: null,
        };
      }

      for (const row of (salesRes.data || []) as any[]) {
        if (!isValidSaleRow(row)) continue;

        const customerId = String(row.customer_id || "");
        if (!customerId || !statsMap[customerId]) continue;

        statsMap[customerId].totalPurchases += 1;
        statsMap[customerId].grossPurchases += Number(row.total_amount || 0);

        const createdAt = String(row.created_at || "");
        if (
          createdAt &&
          (!statsMap[customerId].lastPurchaseAt ||
            createdAt > String(statsMap[customerId].lastPurchaseAt))
        ) {
          statsMap[customerId].lastPurchaseAt = createdAt;
        }
      }

      if (!returnsRes.error) {
        for (const row of (returnsRes.data || []) as any[]) {
          if (!isApprovedReturnRow(row)) continue;

          const customerId = String(row?.sale?.customer_id || "");
          if (!customerId || !statsMap[customerId]) continue;

          const qty = Number(row?.quantity || 0);
          const unitPrice = Number(row?.sale_item?.unit_price || 0);
          const returnAmount = qty * unitPrice;

          statsMap[customerId].totalReturns += returnAmount;
        }
      }

      for (const customerId of Object.keys(statsMap)) {
        statsMap[customerId].netPurchase =
          statsMap[customerId].grossPurchases - statsMap[customerId].totalReturns;
      }

      setCustomerStats(statsMap);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadCustomerHistory = async (customer: Customer) => {
    if (!companyId) return;

    setHistoryCustomer(customer);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistorySales([]);

    const { data, error } = await (supabase as any)
      .from("sales")
      .select(
        "id,receipt_number,customer_name,customer_phone,total_amount,status,created_at,is_returned,branch_id"
      )
      .eq("company_id", companyId)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      toast({
        title: "History load failed",
        description: error.message || "Could not load customer sales history.",
        variant: "destructive",
      });
      setHistorySales([]);
      setHistoryLoading(false);
      return;
    }

    const cleanHistory = ((data || []) as CustomerSale[]).filter((row) => isValidSaleRow(row));

    setHistorySales(cleanHistory);
    setHistoryLoading(false);
  };

  useEffect(() => {
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    void loadCustomerStats(customers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, companyId, currentBranchId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return customers.filter((c) => {
      if (!q) return true;

      return (
        String(c.full_name || "").toLowerCase().includes(q) ||
        String(c.phone || "").toLowerCase().includes(q) ||
        String(c.email || "").toLowerCase().includes(q) ||
        String(c.address || "").toLowerCase().includes(q)
      );
    });
  }, [customers, search]);

  const validateForm = () => {
    if (!companyId) {
      toast({
        title: "Company missing",
        description: "Your profile has no company assigned.",
        variant: "destructive",
      });
      return false;
    }

    if (!fullName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter customer name.",
        variant: "destructive",
      });
      return false;
    }

    const cleanedPhone = phone.trim().replace(/\s+/g, "");
    if (cleanedPhone && cleanedPhone.length < 9) {
      toast({
        title: "Invalid phone",
        description: "Phone number looks too short.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSaveCustomer = async () => {
    if (!validateForm()) return;

    setSaving(true);

    const cleanedPhone = phone.trim().replace(/\s+/g, "");
    const payload = {
      full_name: fullName.trim(),
      phone: cleanedPhone || null,
      email: email.trim() || null,
      address: address.trim() || null,
      branch_id: editingCustomer?.branch_id ?? currentBranchId,
      company_id: companyId,
      is_active: true,
    };

    const { error } = editingCustomer
      ? await (supabase as any)
          .from("customers")
          .update({
            full_name: payload.full_name,
            phone: payload.phone,
            email: payload.email,
            address: payload.address,
          })
          .eq("id", editingCustomer.id)
      : await (supabase as any).from("customers").insert(payload);

    if (error) {
      toast({
        title: editingCustomer ? "Could not update customer" : "Could not save customer",
        description: error.message || "Request failed.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    toast({
      title: editingCustomer ? "Customer updated" : "Customer saved",
      description: editingCustomer
        ? `${fullName.trim()} has been updated.`
        : `${fullName.trim()} has been added.`,
    });

    resetForm();
    setOpen(false);
    setSaving(false);
    await loadCustomers();
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5" />
            Customers
          </CardTitle>

          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </CardHeader>

        <CardContent>
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search customer name, phone, email or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>

          {loading && <p className="text-slate-400 text-center py-6">Loading customers...</p>}

          {!loading && filtered.length === 0 && (
            <p className="text-slate-400 text-center py-6">No customers found</p>
          )}

          <div className="space-y-2">
            {filtered.map((c) => {
              const stats = customerStats[c.id] || {
                totalPurchases: 0,
                grossPurchases: 0,
                totalReturns: 0,
                netPurchase: 0,
                lastPurchaseAt: null,
              };

              return (
                <div key={c.id} className="bg-slate-700/50 p-3 rounded-lg gap-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium truncate">{c.full_name}</p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            c.is_active
                              ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                              : "text-red-300 border-red-500/30 bg-red-500/10"
                          }`}
                        >
                          {c.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400">{c.phone || "No phone"}</p>

                      {(c.email || c.address) && (
                        <p className="text-xs text-slate-500 truncate">
                          {[c.email, c.address].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <div className="rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">Total Purchases</p>
                      <p className="text-sm font-semibold text-white">
                        {statsLoading ? "..." : stats.totalPurchases}
                      </p>
                    </div>

                    <div className="rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">Gross Purchases</p>
                      <p className="text-sm font-semibold text-white">
                        GHS {statsLoading ? "..." : money(stats.grossPurchases)}
                      </p>
                    </div>

                    <div className="rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">Returns</p>
                      <p className="text-sm font-semibold text-amber-300">
                        GHS {statsLoading ? "..." : money(stats.totalReturns)}
                      </p>
                    </div>

                    <div className="rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">Net Purchase</p>
                      <p className="text-sm font-semibold text-white">
                        GHS {statsLoading ? "..." : money(stats.netPurchase)}
                      </p>
                    </div>

                    <div className="rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">Last Purchase</p>
                      <p className="text-sm font-semibold text-white">
                        {statsLoading
                          ? "..."
                          : stats.lastPurchaseAt
                          ? new Date(stats.lastPurchaseAt).toLocaleDateString()
                          : "None"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(c)}
                      className="border-slate-600 bg-slate-800 text-white"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadCustomerHistory(c)}
                      className="border-slate-600 bg-slate-800 text-white"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      View History
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingCustomer ? "Edit Customer" : "Add Customer"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Full Name *</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter customer full name"
              />
            </div>

            <div>
              <Label className="text-slate-200">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter phone number"
              />
            </div>

            <div>
              <Label className="text-slate-200">Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter email"
              />
            </div>

            <div>
              <Label className="text-slate-200">Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter address"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveCustomer} disabled={saving}>
              {saving
                ? editingCustomer
                  ? "Updating..."
                  : "Saving..."
                : editingCustomer
                ? "Update Customer"
                : "Save Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyOpen}
        onOpenChange={(next) => {
          setHistoryOpen(next);
          if (!next) {
            setHistoryCustomer(null);
            setHistorySales([]);
          }
        }}
      >
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {historyCustomer
                ? `${historyCustomer.full_name} • Purchase History`
                : "Purchase History"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {historyLoading && (
              <p className="text-slate-400 text-center py-6">Loading purchase history...</p>
            )}

            {!historyLoading && historySales.length === 0 && (
              <p className="text-slate-400 text-center py-6">
                No valid purchases found for this customer
              </p>
            )}

            {!historyLoading && historySales.length > 0 && (
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {historySales.map((sale) => (
                  <div
                    key={sale.id}
                    className="rounded-lg border border-slate-700 bg-slate-700/40 p-3"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="text-white font-medium">
                          Receipt: {sale.receipt_number || "N/A"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {sale.customer_name || historyCustomer?.full_name || "Customer"}
                          {sale.customer_phone ? ` • ${sale.customer_phone}` : ""}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-white font-semibold">
                          GHS {money(Number(sale.total_amount || 0))}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(sale.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2">
                      <span className="text-[11px] px-2 py-1 rounded-full border border-slate-600 bg-slate-800 text-slate-300">
                        {sale.status || "pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}