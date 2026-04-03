import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getEmptyReconPreview,
  getEmptySalesSummary,
  getExpectedCashForClosing,
  getFinancialPositionAssets,
  getFinancialPositionLiabilities,
  getFinancialPositionNet,
  getFormulaLine,
  getNetSalesValue,
  getPaymentBreakdownLine,
  getProfitFormulaLine,
  getReconciliationDifference,
  getReconciliationExcessAmount,
  getReconciliationShortAmount,
  getReconciliationStatus,
  getReconciliationStatusClasses,
  getVarianceLabel,
} from "@/features/reports/calculations";
import FinancialPositionSection from "@/features/reports/components/FinancialPositionSection";
import FinancialReportSection from "@/features/reports/components/FinancialReportSection";
import OverviewSection from "@/features/reports/components/OverviewSection";
import ReconciliationSection from "@/features/reports/components/ReconciliationSection";
import {
  exportFinancialReportPdf,
  printReconciliationSlip,
} from "@/features/reports/exporters";
import {
  isValidDateRangeSilent,
  isoDate,
  roundMoney,
  safeNumber
} from "@/features/reports/helpers";
import {
  fetchBranchComparison,
  fetchOrgInfo,
  fetchReportsData,
  loadExistingReconciliation,
  saveReconciliation,
} from "@/features/reports/services";
import type {
  AttendanceSummary,
  BranchCompareRow,
  BranchRow,
  CashReconciliationPreview,
  CompanyRow,
  ProductStockRow,
  ReportMenuItem,
  ReportView,
  SalesSummary,
  TopProduct,
} from "@/features/reports/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  BarChart3,
  ChevronDown,
  FileText,
  Landmark,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function Reports() {
  const { toast } = useToast();
  const { activeBranchId, profile, companyName, companyLogoUrl, user } = useAuth() as any;

  const companyId = (profile as any)?.company_id ?? null;
  const userId = user?.id ?? (profile as any)?.user_id ?? null;

  const [activeView, setActiveView] = useState<ReportView>("overview");
  const [startDate, setStartDate] = useState(isoDate(new Date()));
  const [endDate, setEndDate] = useState(isoDate(new Date()));

  const [salesSummary, setSalesSummary] = useState<SalesSummary>(getEmptySalesSummary());
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary>({
    total_staff: 0,
    present_today: 0,
  });
  const [lowStockProducts, setLowStockProducts] = useState<ProductStockRow[]>([]);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [totalStockUnits, setTotalStockUnits] = useState(0);
  const [inventoryValuationBasis, setInventoryValuationBasis] = useState("unknown");

  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<BranchRow | null>(null);
  const [selectedScopeBranchId, setSelectedScopeBranchId] = useState("all");
  const [compareRows, setCompareRows] = useState<BranchCompareRow[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  const [reconciliationDate, setReconciliationDate] = useState(isoDate(new Date()));
  const [openingFloat, setOpeningFloat] = useState("0");
  const [actualCashCounted, setActualCashCounted] = useState("0");
  const [reconciliationNotes, setReconciliationNotes] = useState("");
  const [reconLoading, setReconLoading] = useState(false);
  const [reconSaving, setReconSaving] = useState(false);
  const [existingReconciliationId, setExistingReconciliationId] = useState<string | null>(null);
  const [isReconLocked, setIsReconLocked] = useState(false);
  const [reconPreview, setReconPreview] = useState<CashReconciliationPreview>(
    getEmptyReconPreview()
  );

  const scopedBranchId = selectedScopeBranchId === "all" ? null : selectedScopeBranchId;

  const reportMenuItems = useMemo<ReportMenuItem[]>(
    () => [
      {
        key: "overview",
        label: "Reports Overview",
        icon: <BarChart3 className="mr-2 h-4 w-4" />,
      },
      {
        key: "financial-report",
        label: "Financial Report",
        icon: <FileText className="mr-2 h-4 w-4" />,
      },
      {
        key: "reconciliation",
        label: "Cash Reconciliation",
        icon: <Wallet className="mr-2 h-4 w-4" />,
      },
      {
        key: "financial-position",
        label: "Financial Position",
        icon: <Landmark className="mr-2 h-4 w-4" />,
      },
    ],
    []
  );

  const scopeLabel = useMemo(() => {
    if (scopedBranchId) return selectedBranch?.name || "Selected branch";
    return "All branches";
  }, [scopedBranchId, selectedBranch?.name]);

  const viewTitle = useMemo(() => {
    switch (activeView) {
      case "financial-report":
        return "Financial Report";
      case "reconciliation":
        return "Cash Reconciliation";
      case "financial-position":
        return "Financial Position";
      default:
        return "Reports Overview";
    }
  }, [activeView]);

  const openingFloatNum = useMemo(() => roundMoney(safeNumber(openingFloat)), [openingFloat]);
  const actualCashCountedNum = useMemo(
    () => roundMoney(safeNumber(actualCashCounted)),
    [actualCashCounted]
  );

  const expectedCashForClosing = useMemo(() => {
    return getExpectedCashForClosing(openingFloatNum, reconPreview);
  }, [openingFloatNum, reconPreview]);

  const reconciliationShortAmount = useMemo(() => {
    return getReconciliationShortAmount(actualCashCountedNum, expectedCashForClosing);
  }, [actualCashCountedNum, expectedCashForClosing]);

  const reconciliationExcessAmount = useMemo(() => {
    return getReconciliationExcessAmount(actualCashCountedNum, expectedCashForClosing);
  }, [actualCashCountedNum, expectedCashForClosing]);

  const reconciliationDifference = useMemo(() => {
    return getReconciliationDifference(actualCashCountedNum, expectedCashForClosing);
  }, [actualCashCountedNum, expectedCashForClosing]);

  const reconciliationStatus = useMemo(() => {
    return getReconciliationStatus(reconciliationDifference);
  }, [reconciliationDifference]);

  const reconciliationStatusClasses = useMemo(() => {
    return getReconciliationStatusClasses(reconciliationStatus);
  }, [reconciliationStatus]);

  const varianceLabel = useMemo(() => {
    return getVarianceLabel(reconciliationStatus);
  }, [reconciliationStatus]);

  const formulaLine = useMemo(() => {
    return getFormulaLine(openingFloatNum, reconPreview, expectedCashForClosing);
  }, [openingFloatNum, reconPreview, expectedCashForClosing]);

  const paymentBreakdownLine = useMemo(() => {
    return getPaymentBreakdownLine(salesSummary);
  }, [salesSummary]);

  const netSalesValue = useMemo(() => {
    return getNetSalesValue(salesSummary);
  }, [salesSummary]);

  const profitFormulaLine = useMemo(() => {
    return getProfitFormulaLine(salesSummary);
  }, [salesSummary]);

  const financialPositionAssets = useMemo(() => {
    return getFinancialPositionAssets(expectedCashForClosing, salesSummary);
  }, [expectedCashForClosing, salesSummary]);

  const financialPositionLiabilities = useMemo(() => {
    return getFinancialPositionLiabilities(salesSummary);
  }, [salesSummary]);

  const financialPositionNet = useMemo(() => {
    return getFinancialPositionNet(expectedCashForClosing, salesSummary);
  }, [expectedCashForClosing, salesSummary]);

  const validateDateRangeWithToast = () => {
    if (!startDate || !endDate) {
      toast({
        title: "Invalid dates",
        description: "Please select both start and end dates.",
        variant: "destructive",
      });
      return false;
    }

    if (startDate > endDate) {
      toast({
        title: "Invalid date range",
        description: "Start date cannot be after end date.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const resetReconciliationForm = () => {
    setOpeningFloat("0");
    setActualCashCounted("0");
    setReconciliationNotes("");
    setExistingReconciliationId(null);
    setIsReconLocked(false);
  };

  const handleFetchOrgInfo = async () => {
    try {
      const result = await fetchOrgInfo(companyId, activeBranchId);
      setCompany(result.company);
      setBranches(result.branches);
      setSelectedBranch(result.selectedBranch);
      setSelectedScopeBranchId(result.selectedScopeBranchId);
    } catch (e) {
      console.error(e);
      setCompany(null);
      setBranches([]);
      setSelectedBranch(null);
      setSelectedScopeBranchId("all");
    }
  };

  const handleFetchBranchComparison = async () => {
    if (!companyId || !validateDateRangeWithToast()) return;

    setCompareLoading(true);
    setCompareRows([]);

    try {
      const rows = await fetchBranchComparison({
        companyId,
        branches,
        startDate,
        endDate,
      });
      setCompareRows(rows);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Comparison error",
        description: e?.message || "Failed to load branch comparison",
        variant: "destructive",
      });
    } finally {
      setCompareLoading(false);
    }
  };

  const handleFetchReports = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!companyId) {
      setSalesSummary(getEmptySalesSummary());
      setTopProducts([]);
      setAttendanceSummary({ total_staff: 0, present_today: 0 });
      setLowStockProducts([]);
      setCompareRows([]);
      setReconPreview(getEmptyReconPreview());
      setTotalProductsCount(0);
      setTotalStockUnits(0);
      setInventoryValuationBasis("unknown");
      return;
    }

    const valid = silent
      ? isValidDateRangeSilent(startDate, endDate)
      : validateDateRangeWithToast();

    if (!valid) return;

    setLoading(true);

    try {
      const result = await fetchReportsData({
        companyId,
        scopedBranchId,
        startDate,
        endDate,
        openingFloatNum,
      });

      setSalesSummary(result.salesSummary);
      setTopProducts(result.topProducts);
      setAttendanceSummary(result.attendanceSummary);
      setLowStockProducts(result.lowStockProducts);
      setTotalProductsCount(result.totalProductsCount);
      setTotalStockUnits(result.totalStockUnits);
      setInventoryValuationBasis(result.inventoryValuationBasis);
      setReconPreview(result.reconPreview);

      if (!scopedBranchId) {
        const rows = await fetchBranchComparison({
          companyId,
          branches,
          startDate,
          endDate,
        });
        setCompareRows(rows);
      } else {
        setCompareRows([]);
      }
    } catch (error: any) {
      console.error("Error fetching reports:", error);
      toast({
        title: "Report error",
        description: error?.message || "Failed to generate report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadExistingReconciliation = async () => {
    if (!companyId || !scopedBranchId || !reconciliationDate) {
      resetReconciliationForm();
      return;
    }

    setReconLoading(true);

    try {
      const row = await loadExistingReconciliation({
        companyId,
        scopedBranchId,
        reconciliationDate,
      });

      if (!row) {
        resetReconciliationForm();
        return;
      }

      setExistingReconciliationId(row.id);
      setOpeningFloat(String(roundMoney(row.opening_float || 0)));
      setActualCashCounted(String(roundMoney(row.actual_cash_counted || 0)));
      setReconciliationNotes(row.notes || "");
      setIsReconLocked(Boolean(row.is_locked));
    } catch (e) {
      console.error(e);
      resetReconciliationForm();
    } finally {
      setReconLoading(false);
    }
  };

  const handleSaveReconciliation = async () => {
    if (!companyId || !scopedBranchId || !userId) {
      toast({
        title: "Missing details",
        description: "Company, branch, or user is missing.",
        variant: "destructive",
      });
      return;
    }

    if (isReconLocked) {
      toast({
        title: "Locked record",
        description: "This closing record is already locked and cannot be edited.",
        variant: "destructive",
      });
      return;
    }

    if (openingFloatNum < 0 || actualCashCountedNum < 0) {
      toast({
        title: "Invalid values",
        description: "Opening float and actual cash counted cannot be negative.",
        variant: "destructive",
      });
      return;
    }

    if (!reconciliationDate) {
      toast({
        title: "Missing date",
        description: "Please select a reconciliation date.",
        variant: "destructive",
      });
      return;
    }

    setReconSaving(true);

    try {
      const result = await saveReconciliation({
        existingReconciliationId,
        companyId,
        scopedBranchId,
        reconciliationDate,
        openingFloatNum,
        actualCashCountedNum,
        reconciliationNotes,
        reconPreview,
        expectedCashForClosing,
        reconciliationDifference,
        userId,
      });

      setExistingReconciliationId(result.id);
      setIsReconLocked(result.is_locked);

      toast({
        title: "Reconciliation saved",
        description: "Closing record saved and locked successfully.",
      });

      await handleLoadExistingReconciliation();
      await handleFetchReports({ silent: true });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save reconciliation.",
        variant: "destructive",
      });
    } finally {
      setReconSaving(false);
    }
  };

  const handleExportReportPdf = async () => {
    try {
      await exportFinancialReportPdf({
        companyLogoUrl,
        companyName,
        company,
        selectedBranch,
        scopedBranchId,
        startDate,
        endDate,
        salesSummary,
        netSalesValue,
        inventoryValuationBasis,
      });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not export",
        variant: "destructive",
      });
    }
  };

  const handlePrintClosingSlip = async () => {
    if (!scopedBranchId) {
      toast({
        title: "Branch required",
        description: "Please select a branch before printing a closing slip.",
        variant: "destructive",
      });
      return;
    }

    if (!existingReconciliationId || !isReconLocked) {
      toast({
        title: "Save first",
        description: "Please save and lock the closing record before printing the closing slip.",
        variant: "destructive",
      });
      return;
    }

    try {
      await printReconciliationSlip({
        companyLogoUrl,
        companyName,
        company,
        selectedBranch,
        reconciliationDate,
        reconciliationNotes,
        salesSummary,
        openingFloatNum,
        reconPreview,
        expectedCashForClosing,
        actualCashCountedNum,
        reconciliationStatus,
        reconciliationShortAmount,
        reconciliationExcessAmount,
        varianceLabel,
        paymentBreakdownLine,
        formulaLine,
      });
    } catch (e: any) {
      toast({
        title: "Print failed",
        description: e?.message || "Could not print closing slip.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    void handleFetchOrgInfo();
  }, [activeBranchId, companyId]);

  useEffect(() => {
    if (!scopedBranchId) {
      setSelectedBranch(null);
      return;
    }

    const match = branches.find((b) => b.id === scopedBranchId) || null;
    setSelectedBranch(match);
  }, [branches, scopedBranchId]);

  useEffect(() => {
    if (!companyId) return;
    if (!isValidDateRangeSilent(startDate, endDate)) return;
    void handleFetchReports({ silent: true });
  }, [companyId, scopedBranchId, startDate, endDate, openingFloatNum, branches.length]);

  useEffect(() => {
    if (!scopedBranchId) {
      resetReconciliationForm();
      return;
    }
    void handleLoadExistingReconciliation();
  }, [scopedBranchId, reconciliationDate, companyId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">{viewTitle}</h1>
          <p className="text-slate-400">
            Central reporting hub for business performance, cash control and financial position{" "}
            <span className="text-slate-500">• {scopeLabel}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Other Reports
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {reportMenuItems.map((item) => (
                <DropdownMenuItem key={item.key} onClick={() => setActiveView(item.key)}>
                  {item.icon}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {(activeView === "financial-report" || activeView === "overview") && (
            <Button variant="outline" onClick={handleExportReportPdf}>
              Export PDF
            </Button>
          )}
        </div>
      </div>

      <Card className="border-slate-700 bg-slate-800/50">
        <CardContent className="pt-6">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-slate-600 bg-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-slate-600 bg-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Branch Scope</Label>
              <Select
                value={selectedScopeBranchId}
                onValueChange={(v) => setSelectedScopeBranchId(v)}
              >
                <SelectTrigger className="border-slate-600 bg-slate-700 text-white">
                  <SelectValue placeholder="Select branch scope" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-800 text-white">
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Button
                onClick={() => void handleFetchReports()}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Loading..." : "Refresh Data"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {activeView === "overview" && (
        <OverviewSection
          scopeLabel={scopeLabel}
          salesSummary={salesSummary}
          inventoryValuationBasis={inventoryValuationBasis}
          totalStockUnits={totalStockUnits}
          totalProductsCount={totalProductsCount}
          attendanceSummary={attendanceSummary}
          paymentBreakdownLine={paymentBreakdownLine}
          formulaLine={formulaLine}
          profitFormulaLine={profitFormulaLine}
          expectedCashForClosing={expectedCashForClosing}
        />
      )}

      {activeView === "financial-report" && (
        <FinancialReportSection
          scopedBranchId={scopedBranchId}
          compareLoading={compareLoading}
          compareRows={compareRows}
          onRefreshComparison={() => void handleFetchBranchComparison()}
          topProducts={topProducts}
          lowStockProducts={lowStockProducts}
          inventoryValuationBasis={inventoryValuationBasis}
          attendanceSummary={attendanceSummary}
          salesSummary={salesSummary}
        />
      )}

      {activeView === "reconciliation" && (
        <ReconciliationSection
          scopedBranchId={scopedBranchId}
          reconciliationDate={reconciliationDate}
          setReconciliationDate={setReconciliationDate}
          openingFloat={openingFloat}
          setOpeningFloat={setOpeningFloat}
          actualCashCounted={actualCashCounted}
          setActualCashCounted={setActualCashCounted}
          reconciliationNotes={reconciliationNotes}
          setReconciliationNotes={setReconciliationNotes}
          isReconLocked={isReconLocked}
          existingReconciliationId={existingReconciliationId}
          reconLoading={reconLoading}
          reconSaving={reconSaving}
          reconciliationStatusClasses={reconciliationStatusClasses}
          varianceLabel={varianceLabel}
          salesSummary={salesSummary}
          reconPreview={reconPreview}
          openingFloatNum={openingFloatNum}
          expectedCashForClosing={expectedCashForClosing}
          actualCashCountedNum={actualCashCountedNum}
          reconciliationStatus={reconciliationStatus}
          reconciliationShortAmount={reconciliationShortAmount}
          reconciliationExcessAmount={reconciliationExcessAmount}
          paymentBreakdownLine={paymentBreakdownLine}
          formulaLine={formulaLine}
          handleSaveReconciliation={() => void handleSaveReconciliation()}
          loadExistingReconciliation={() => void handleLoadExistingReconciliation()}
          printClosingSlip={() => void handlePrintClosingSlip()}
        />
      )}

      {activeView === "financial-position" && (
        <FinancialPositionSection
          salesSummary={salesSummary}
          totalStockUnits={totalStockUnits}
          totalProductsCount={totalProductsCount}
          lowStockProducts={lowStockProducts}
          financialPositionAssets={financialPositionAssets}
          financialPositionLiabilities={financialPositionLiabilities}
          financialPositionNet={financialPositionNet}
          expectedCashForClosing={expectedCashForClosing}
        />
      )}
    </div>
  );
}