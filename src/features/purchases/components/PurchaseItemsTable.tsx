import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPurchaseLineTotal, money } from "@/features/purchases/helpers";
import type { ProductOption, PurchaseItemFormRow } from "@/features/purchases/types";

type Props = {
  rows: PurchaseItemFormRow[];
  products: ProductOption[];
  loadingProducts?: boolean;
  onChangeRow: (rowId: string, patch: Partial<PurchaseItemFormRow>) => void;
  onRemoveRow: (rowId: string) => void;
  onAddRow: () => void;
};

export default function PurchaseItemsTable({
  rows,
  products,
  loadingProducts = false,
  onChangeRow,
  onRemoveRow,
  onAddRow,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-600 bg-slate-900">
        <table className="w-full min-w-[900px]">
          <thead className="bg-slate-800">
            <tr className="border-b border-slate-700">
              <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                Product
              </th>
              <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                Quantity
              </th>
              <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                Unit Cost
              </th>
              <th className="px-3 py-3 text-left text-sm font-semibold text-slate-200">
                Line Discount
              </th>
              <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">
                Line Total
              </th>
              <th className="px-3 py-3 text-right text-sm font-semibold text-slate-200">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.rowId} className="border-b border-slate-700 last:border-b-0">
                <td className="px-3 py-3">
                  <Select
                    value={row.product_id}
                    onValueChange={(value) => {
                      const product = products.find((p) => p.id === value);
                      onChangeRow(row.rowId, {
                        product_id: value,
                        product_name: product?.name || "",
                        unit_cost: String(product?.last_cost ?? product?.cost_price ?? 0),
                      });
                    }}
                    disabled={loadingProducts}
                  >
                    <SelectTrigger className="border-slate-600 bg-slate-800 text-white">
                      <SelectValue
                        placeholder={loadingProducts ? "Loading products..." : "Select product"}
                      />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      className="z-[100] max-h-72 border-slate-700 bg-slate-900 text-white"
                    >
                      {loadingProducts ? (
                        <SelectItem value="__loading_products" disabled>
                          Loading products...
                        </SelectItem>
                      ) : products.length > 0 ? (
                        products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_products" disabled>
                          No products found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </td>

                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.quantity}
                    onChange={(e) => onChangeRow(row.rowId, { quantity: e.target.value })}
                    className="border-slate-600 bg-slate-800 text-white"
                  />
                </td>

                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unit_cost}
                    onChange={(e) => onChangeRow(row.rowId, { unit_cost: e.target.value })}
                    className="border-slate-600 bg-slate-800 text-white"
                  />
                </td>

                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.line_discount}
                    onChange={(e) => onChangeRow(row.rowId, { line_discount: e.target.value })}
                    className="border-slate-600 bg-slate-800 text-white"
                  />
                </td>

                <td className="px-3 py-3 text-right font-medium text-white">
                  GHS {money(getPurchaseLineTotal(row))}
                </td>

                <td className="px-3 py-3 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRemoveRow(row.rowId)}
                    disabled={rows.length === 1}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" onClick={onAddRow}>
        Add Item Row
      </Button>
    </div>
  );
}