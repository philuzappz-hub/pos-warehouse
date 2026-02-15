import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Calendar, Package, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SalesSummary {
  totalSales: number;
  totalAmount: number;
  avgSale: number;
}

interface TopProduct {
  name: string;
  total_qty: number;
  total_revenue: number;
}

interface AttendanceSummary {
  total_staff: number;
  present_today: number;
}

export default function Reports() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary>({ totalSales: 0, totalAmount: 0, avgSale: 0 });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary>({ total_staff: 0, present_today: 0 });
  const [lowStockProducts, setLowStockProducts] = useState<{ name: string; quantity_in_stock: number; reorder_level: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      // Sales summary
      const { data: sales } = await supabase
        .from('sales')
        .select('total_amount')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');

      if (sales) {
        const totalAmount = sales.reduce((sum, s) => sum + Number(s.total_amount), 0);
        setSalesSummary({
          totalSales: sales.length,
          totalAmount,
          avgSale: sales.length > 0 ? totalAmount / sales.length : 0
        });
      }

      // Top products (last 30 days)
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('quantity, unit_price, product:products(name)')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (saleItems) {
        const productMap = new Map<string, { total_qty: number; total_revenue: number }>();
        saleItems.forEach(item => {
          const name = (item.product as any)?.name || 'Unknown';
          const existing = productMap.get(name) || { total_qty: 0, total_revenue: 0 };
          productMap.set(name, {
            total_qty: existing.total_qty + item.quantity,
            total_revenue: existing.total_revenue + (item.quantity * Number(item.unit_price))
          });
        });

        const sorted = Array.from(productMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .slice(0, 10);

        setTopProducts(sorted);
      }

      // Attendance today
      const { data: profiles, count: totalStaff } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: presentToday } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('date', today);

      setAttendanceSummary({
        total_staff: totalStaff || 0,
        present_today: presentToday || 0
      });

      // Low stock
      const { data: lowStock } = await supabase
        .from('products')
        .select('name, quantity_in_stock, reorder_level')
        .lt('quantity_in_stock', 10)
        .order('quantity_in_stock', { ascending: true })
        .limit(10);

      setLowStockProducts(lowStock || []);

    } catch (error) {
      console.error('Error fetching reports:', error);
    }

    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400">Business insights and summaries</p>
        </div>
      </div>

      {/* Date Filter */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label className="text-slate-200">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="flex-1">
              <Label className="text-slate-200">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <Button onClick={fetchReports} disabled={loading}>
              {loading ? 'Loading...' : 'Generate Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Sales</CardTitle>
            <BarChart3 className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{salesSummary.totalSales}</div>
            <p className="text-xs text-slate-400">transactions</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Revenue</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">GHC {salesSummary.totalAmount.toLocaleString()}</div>
            <p className="text-xs text-slate-400">for selected period</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Average Sale</CardTitle>
            <Calendar className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">GHC {salesSummary.avgSale.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <p className="text-xs text-slate-400">per transaction</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Attendance Today</CardTitle>
            <Users className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {attendanceSummary.present_today}/{attendanceSummary.total_staff}
            </div>
            <p className="text-xs text-slate-400">staff present</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Products */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Selling Products (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-slate-400 text-right">Qty Sold</TableHead>
                  <TableHead className="text-slate-400 text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((product, idx) => (
                  <TableRow key={idx} className="border-slate-700">
                    <TableCell className="text-white">{product.name}</TableCell>
                    <TableCell className="text-slate-300 text-right">{product.total_qty}</TableCell>
                    <TableCell className="text-slate-300 text-right">₦{product.total_revenue.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {topProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-400 py-6">
                      No sales data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Package className="h-5 w-5 text-red-500" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-slate-400 text-right">In Stock</TableHead>
                  <TableHead className="text-slate-400 text-right">Reorder At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.map((product, idx) => (
                  <TableRow key={idx} className="border-slate-700">
                    <TableCell className="text-white">{product.name}</TableCell>
                    <TableCell className="text-red-400 text-right font-medium">{product.quantity_in_stock}</TableCell>
                    <TableCell className="text-slate-300 text-right">{product.reorder_level || 10}</TableCell>
                  </TableRow>
                ))}
                {lowStockProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-400 py-6">
                      All products are well stocked
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
