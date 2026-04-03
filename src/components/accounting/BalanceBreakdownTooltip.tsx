import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

type Props = {
  openingBalance?: number;
  purchases?: number;
  payments?: number;
  overpaymentCredits?: number;
  unallocatedPayments?: number;
  creditsApplied?: number;
  netPayable?: number;
  availableCredit?: number;
  money: (value: number) => string;
  label?: string;
};

export default function BalanceBreakdownTooltip({
  openingBalance = 0,
  purchases = 0,
  payments = 0,
  overpaymentCredits = 0,
  unallocatedPayments = 0,
  creditsApplied = 0,
  netPayable = 0,
  availableCredit = 0,
  money,
  label = "How this was calculated",
}: Props) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 focus:outline-none"
          >
            <Info className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        </TooltipTrigger>

        <TooltipContent
          side="top"
          align="start"
          className="max-w-[320px] border border-slate-700 bg-slate-900 text-slate-100"
        >
          <div className="space-y-3 text-xs">
            <div>
              <p className="mb-2 font-semibold text-white">Net Payable</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span>Opening Balance</span>
                  <span>GHS {money(openingBalance)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>+ Purchases</span>
                  <span>GHS {money(purchases)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>- Cash Payments</span>
                  <span>GHS {money(payments)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>- Credits Applied</span>
                  <span>GHS {money(creditsApplied)}</span>
                </div>
                <div className="border-t border-slate-700 pt-1">
                  <div className="flex items-center justify-between gap-4 font-semibold text-amber-300">
                    <span>= Net Payable</span>
                    <span>GHS {money(netPayable)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-3">
              <p className="mb-2 font-semibold text-white">Available Supplier Credit</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span>Overpayment Credits</span>
                  <span>GHS {money(overpaymentCredits)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>+ Unallocated Payments</span>
                  <span>GHS {money(unallocatedPayments)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>- Credits Applied</span>
                  <span>GHS {money(creditsApplied)}</span>
                </div>
                <div className="border-t border-slate-700 pt-1">
                  <div className="flex items-center justify-between gap-4 font-semibold text-cyan-300">
                    <span>= Available Credit</span>
                    <span>GHS {money(availableCredit)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}