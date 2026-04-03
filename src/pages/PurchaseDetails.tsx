import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/features/purchases/helpers";
import { fetchPurchaseDetails } from "@/features/purchases/services";
import type { PurchaseDetailsResult } from "@/features/purchases/types";
import type { BranchRow } from "@/features/reports/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

export default function PurchaseDetails() {
  const { toast } = useToast();
  const { purchaseId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth() as any;

  const companyId = profile?.company_id ?? null;

  const [details, setDetails] = useState<PurchaseDetailsResult | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  const getBranchName = (branchId: string) => {
    return branches.find((b) => b.id === branchId)?.name || "Unknown branch";
  };

  const loadDetails = async () => {
    if (!companyId || !purchaseId) return;

    setLoading(true);
    try {
      const result = await fetchPurchaseDetails({
        companyId,
        purchaseId,
      });
      setDetails(result);
    } catch (e: any) {
      toast({
        title: "Load failed",
        description: e?.message || "Could not load purchase details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, [companyId]);

  useEffect(() => {
    void loadDetails();
  }, [companyId, purchaseId]);

  if (!purchaseId) {
    return <div className="text-white">Invalid purchase.</div>;
  }

  const purchase = details?.purchase || null;
  const items = details?.items || [];
  const payments = details?.payments || [];

  const canPayThisPurchase =
    !!purchase &&
    purchase.payment_status !== "paid" &&
    Number(purchase.balance_due || 0) > 0;

  return (
    <div className="space-y-6 bg-slate-950 p-1">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Purchase Details</h1>
          <p className="text-slate-300">
            Review supplier, totals, balances, credit usage, item lines, linked payments, and overpayment details.{" "}
            {loading ? "Loading..." : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canPayThisPurchase && (
            <Button
              onClick={() =>
                navigate(
                  `/suppliers/payments?supplierId=${purchase.supplier_id}&purchaseId=${purchase.id}`
                )
              }
            >
              Pay This Purchase
            </Button>
          )}

          <Button asChild variant="outline">
            <Link to="/purchases">Back to Purchases</Link>
          </Button>
        </div>
      </div>

      {purchase && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="border-slate-600 bg-slate-900 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300">Total Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">GHS {money(purchase.total_amount)}</div>
              </CardContent>
            </Card>

            <Card className="border-slate-600 bg-slate-900 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300">Applied Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-300">
                  GHS {money(purchase.amount_paid)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-600 bg-slate-900 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300">Balance Due</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-300">
                  GHS {money(purchase.balance_due)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-700/40 bg-slate-900 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300">Credit Applied</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-cyan-300">
                  GHS {money(purchase.supplier_credit_applied || 0)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-600 bg-slate-900 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300">Overpayment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-violet-300">
                  GHS {money(purchase.overpayment_amount || 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-600 bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-white">Purchase Header</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm">
              <div>
                <p className="text-slate-400">Supplier</p>
                <p className="text-white">{purchase.supplier?.name || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Supplier Code</p>
                <p className="text-white">{purchase.supplier?.supplier_code || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Branch</p>
                <p className="text-white">{getBranchName(purchase.branch_id)}</p>
              </div>
              <div>
                <p className="text-slate-400">Purchase Date</p>
                <p className="text-white">{purchase.purchase_date}</p>
              </div>
              <div>
                <p className="text-slate-400">Invoice Number</p>
                <p className="text-white">{purchase.invoice_number || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Reference Number</p>
                <p className="text-white">{purchase.reference_number || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Stock Status</p>
                <p className="text-white capitalize">{purchase.stock_status}</p>
              </div>
              <div>
                <p className="text-slate-400">Payment Status</p>
                <p className="text-white capitalize">{purchase.payment_status}</p>
              </div>
              <div className="md:col-span-2 xl:col-span-4">
                <p className="text-slate-400">Notes</p>
                <p className="text-white">{purchase.notes || "-"}</p>
              </div>
            </CardContent>
          </Card>

          {(purchase.supplier_credit_applied || 0) > 0 && (
            <Card className="border-cyan-700/40 bg-cyan-500/10 shadow-sm">
              <CardHeader>
                <CardTitle className="text-cyan-200">Supplier Credit Used</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-cyan-100">
                Existing supplier credit was automatically applied to this purchase.
                <span className="ml-1 font-semibold">
                  GHS {money(purchase.supplier_credit_applied || 0)}
                </span>
              </CardContent>
            </Card>
          )}

          {(purchase.overpayment_amount || 0) > 0 && (
            <Card className="border-violet-700/40 bg-violet-500/10 shadow-sm">
              <CardHeader>
                <CardTitle className="text-violet-200">Overpayment Recorded</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-violet-100">
                This purchase was paid above its remaining amount after supplier credit.
                Extra amount recorded:
                <span className="ml-1 font-semibold">
                  GHS {money(purchase.overpayment_amount || 0)}
                </span>
              </CardContent>
            </Card>
          )}

          <Card className="border-slate-600 bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-white">Supplier Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm">
              <div>
                <p className="text-slate-400">Contact Person</p>
                <p className="text-white">{purchase.supplier?.contact_person || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Phone</p>
                <p className="text-white">{purchase.supplier?.phone || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Email</p>
                <p className="text-white">{purchase.supplier?.email || "-"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-600 bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-white">Purchase Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-600 bg-slate-900">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-slate-800">
                    <tr className="border-b border-slate-700">
                      <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                        Product
                      </th>
                      <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">
                        Quantity
                      </th>
                      <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">
                        Unit Cost
                      </th>
                      <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">
                        Discount
                      </th>
                      <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">
                        Line Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-700 last:border-b-0">
                        <td className="px-3 py-3 text-white">{item.product?.name || "-"}</td>
                        <td className="px-3 py-3 text-right text-slate-200">{item.quantity}</td>
                        <td className="px-3 py-3 text-right text-slate-200">
                          GHS {money(item.unit_cost)}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-200">
                          GHS {money(item.line_discount)}
                        </td>
                        <td className="px-3 py-3 text-right text-white">
                          GHS {money(item.line_total)}
                        </td>
                      </tr>
                    ))}

                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-300">
                          No purchase items found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-600 bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-white">Linked Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-600 bg-slate-900">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-slate-800">
                    <tr className="border-b border-slate-700">
                      <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                        Date
                      </th>
                      <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                        Method
                      </th>
                      <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                        Reference
                      </th>
                      <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                        Notes
                      </th>
                      <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">
                        Amount
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-700 last:border-b-0">
                        <td className="px-3 py-3 text-slate-200">{payment.payment_date}</td>
                        <td className="px-3 py-3 text-slate-200 capitalize">
                          {payment.payment_method}
                        </td>
                        <td className="px-3 py-3 text-slate-200">
                          {payment.reference_number || "-"}
                        </td>
                        <td className="px-3 py-3 text-slate-200">{payment.notes || "-"}</td>
                        <td className="px-3 py-3 text-right text-emerald-300 font-semibold">
                          GHS {money(payment.amount)}
                        </td>
                      </tr>
                    ))}

                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-300">
                          No linked payments found for this purchase.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}