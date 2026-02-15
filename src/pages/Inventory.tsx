import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Category, Product } from '@/types/database';
import { Edit2, Plus, Search, Trash2, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

const UNIT_OPTIONS = [
  { value: 'piece', label: 'Piece' },
  { value: 'packet', label: 'Packet' },
  { value: 'box', label: 'Box' },
  { value: 'bag', label: 'Bag' },
  { value: 'ton', label: 'Ton' },
  { value: 'kg', label: 'Kg' },
  { value: 'meter', label: 'Meter' },
  { value: 'feet', label: 'Feet' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'carton', label: 'Carton' },
  { value: 'roll', label: 'Roll' },
];

export default function Inventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Product form
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    category_id: '',
    unit: 'piece',
    unit_price: '',
    reorder_level: '10'
  });

  // Stock receipt form
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [receiptForm, setReceiptForm] = useState({
    quantity: '',
    supplier_name: '',
    notes: ''
  });

  // Category form
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('inventory-products-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        () => {
          fetchData(); // 🔁 auto-refresh inventory stock
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    const [productsRes, categoriesRes] = await Promise.all([
      supabase.from('products').select('*, category:categories(*)').order('name'),
      supabase.from('categories').select('*').order('name')
    ]);

    if (productsRes.data) setProducts(productsRes.data as Product[]);
    if (categoriesRes.data) setCategories(categoriesRes.data as Category[]);
    setLoading(false);
  };

  const handleSaveProduct = async () => {
    const productData = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim() || null,
      category_id: productForm.category_id || null,
      unit: productForm.unit,
      unit_price: parseFloat(productForm.unit_price) || 0,
      reorder_level: parseInt(productForm.reorder_level) || 10
    };

    if (!productData.name) {
      toast({ title: 'Error', description: 'Product name is required', variant: 'destructive' });
      return;
    }

    let error;
    if (editingProduct) {
      ({ error } = await supabase.from('products').update(productData).eq('id', editingProduct.id));
    } else {
      ({ error } = await supabase.from('products').insert(productData));
    }

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `Product ${editingProduct ? 'updated' : 'created'}` });
      setProductDialogOpen(false);
      resetProductForm();
      fetchData();
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: 'Product removed' });
      fetchData();
    }
  };

  const handleReceiveStock = async () => {
    if (!user || !selectedProduct) return;

    const quantity = parseInt(receiptForm.quantity);
    if (!quantity || quantity <= 0) {
      toast({ title: 'Error', description: 'Enter a valid quantity', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('stock_receipts').insert({
      product_id: selectedProduct.id,
      quantity,
      supplier_name: receiptForm.supplier_name.trim() || null,
      notes: receiptForm.notes.trim() || null,
      received_by: user.id
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Stock Received', description: `Added ${quantity} ${selectedProduct.unit}(s)` });
      setReceiptDialogOpen(false);
      setReceiptForm({ quantity: '', supplier_name: '', notes: '' });
      fetchData();
    }
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) return;

    const { error } = await supabase.from('categories').insert({ name: categoryName.trim() });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Category Created' });
      setCategoryDialogOpen(false);
      setCategoryName('');
      fetchData();
    }
  };

  const resetProductForm = () => {
    setEditingProduct(null);
    setProductForm({ name: '', sku: '', category_id: '', unit: 'piece', unit_price: '', reorder_level: '10' });
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      sku: product.sku || '',
      category_id: product.category_id || '',
      unit: product.unit,
      unit_price: product.unit_price.toString(),
      reorder_level: product.reorder_level?.toString() || '10'
    });
    setProductDialogOpen(true);
  };

  const openReceiveStock = (product: Product) => {
    setSelectedProduct(product);
    setReceiptDialogOpen(true);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Management</h1>
          <p className="text-slate-400">Manage products and stock levels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Category
          </Button>
          <Button onClick={() => { resetProductForm(); setProductDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Product
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-slate-800 border-slate-700 text-white"
        />
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Product</TableHead>
                <TableHead className="text-slate-400">SKU</TableHead>
                <TableHead className="text-slate-400">Category</TableHead>
                <TableHead className="text-slate-400">Price (GHS)</TableHead>
                <TableHead className="text-slate-400">Stock</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map(product => (
                <TableRow key={product.id} className="border-slate-700">
                  <TableCell className="text-white font-medium">{product.name}</TableCell>
                  <TableCell className="text-slate-300">{product.sku || '-'}</TableCell>
                  <TableCell className="text-slate-300">{product.category?.name || '-'}</TableCell>
                  <TableCell className="text-slate-300">GHS {product.unit_price.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={product.quantity_in_stock < (product.reorder_level || 10) ? 'destructive' : 'default'}>
                      {product.quantity_in_stock} {product.unit}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openReceiveStock(product)} title="Receive Stock">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEditProduct(product)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteProduct(product.id)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    {loading ? 'Loading...' : 'No products found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Product Dialog */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Name *</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-200">SKU</Label>
                <Input
                  value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-200">Category</Label>
                <Select value={productForm.category_id} onValueChange={(v) => setProductForm({ ...productForm, category_id: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-200">Unit</Label>
                <Select value={productForm.unit} onValueChange={(v) => setProductForm({ ...productForm, unit: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-200">Price (GHS)</Label>
                <Input
                  type="number"
                  value={productForm.unit_price}
                  onChange={(e) => setProductForm({ ...productForm, unit_price: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-200">Reorder Level</Label>
                <Input
                  type="number"
                  value={productForm.reorder_level}
                  onChange={(e) => setProductForm({ ...productForm, reorder_level: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProduct}>{editingProduct ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Stock Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Receive Stock - {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-400">Current stock: {selectedProduct?.quantity_in_stock} {selectedProduct?.unit}</p>
            <div>
              <Label className="text-slate-200">Quantity Received *</Label>
              <Input
                type="number"
                value={receiptForm.quantity}
                onChange={(e) => setReceiptForm({ ...receiptForm, quantity: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-200">Supplier Name</Label>
              <Input
                value={receiptForm.supplier_name}
                onChange={(e) => setReceiptForm({ ...receiptForm, supplier_name: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-200">Notes</Label>
              <Input
                value={receiptForm.notes}
                onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReceiveStock}>Receive Stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Add Category</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-slate-200">Category Name</Label>
            <Input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCategory}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}