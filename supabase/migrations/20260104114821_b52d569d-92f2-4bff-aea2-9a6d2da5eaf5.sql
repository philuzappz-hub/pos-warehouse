-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'cashier', 'warehouse', 'staff');

-- Create enum for order status
CREATE TYPE public.order_status AS ENUM ('pending', 'picking', 'completed', 'returned');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  UNIQUE (user_id, role)
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category_id UUID REFERENCES public.categories(id),
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  quantity_in_stock INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create sales/orders table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  cashier_id UUID REFERENCES auth.users(id) NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create sale_items table
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  picked BOOLEAN NOT NULL DEFAULT false,
  picked_by UUID REFERENCES auth.users(id),
  picked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create returns table
CREATE TABLE public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) NOT NULL,
  sale_item_id UUID REFERENCES public.sale_items(id) NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT,
  processed_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create attendance table
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (user_id, date)
);

-- Create stock_receipts table for incoming goods
CREATE TABLE public.stock_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  supplier_name TEXT,
  notes TEXT,
  received_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles policies (only admins can manage)
CREATE POLICY "Authenticated users can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Categories policies
CREATE POLICY "Authenticated users can view categories" ON public.categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage categories" ON public.categories
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Products policies
CREATE POLICY "Authenticated users can view products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Sales policies
CREATE POLICY "Authenticated users can view sales" ON public.sales
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers and admins can create sales" ON public.sales
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'cashier') OR public.is_admin(auth.uid())
  );

CREATE POLICY "Cashiers can update own sales" ON public.sales
  FOR UPDATE TO authenticated USING (
    cashier_id = auth.uid() OR public.is_admin(auth.uid())
  );

-- Sale items policies
CREATE POLICY "Authenticated users can view sale items" ON public.sale_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers and admins can create sale items" ON public.sale_items
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'cashier') OR public.is_admin(auth.uid())
  );

CREATE POLICY "Warehouse and admins can update sale items" ON public.sale_items
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'warehouse') OR public.is_admin(auth.uid())
  );

-- Returns policies
CREATE POLICY "Authenticated users can view returns" ON public.returns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers and admins can create returns" ON public.returns
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'cashier') OR public.is_admin(auth.uid())
  );

-- Attendance policies
CREATE POLICY "Users can view own attendance" ON public.attendance
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can clock in/out" ON public.attendance
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own attendance" ON public.attendance
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Stock receipts policies
CREATE POLICY "Authenticated users can view stock receipts" ON public.stock_receipts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can create stock receipts" ON public.stock_receipts
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'full_name', new.email));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate receipt number
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_number TEXT;
BEGIN
  SELECT 'RCP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(COALESCE(
    (SELECT COUNT(*) + 1 FROM public.sales WHERE DATE(created_at) = CURRENT_DATE)::TEXT, '1'
  ), 4, '0')
  INTO new_number;
  RETURN new_number;
END;
$$;

-- Trigger to update product stock on sale
CREATE OR REPLACE FUNCTION public.update_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET quantity_in_stock = quantity_in_stock - NEW.quantity,
      updated_at = now()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sale_item_created
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_sale();

-- Trigger to update stock on return
CREATE OR REPLACE FUNCTION public.update_stock_on_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET quantity_in_stock = quantity_in_stock + NEW.quantity,
      updated_at = now()
  WHERE id = (SELECT product_id FROM public.sale_items WHERE id = NEW.sale_item_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_return_created
  AFTER INSERT ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_return();

-- Trigger to update stock on stock receipt
CREATE OR REPLACE FUNCTION public.update_stock_on_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET quantity_in_stock = quantity_in_stock + NEW.quantity,
      updated_at = now()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_stock_receipt_created
  AFTER INSERT ON public.stock_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_receipt();