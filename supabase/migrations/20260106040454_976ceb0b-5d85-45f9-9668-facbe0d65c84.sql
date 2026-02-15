-- Create function to check if user is attendance manager
CREATE OR REPLACE FUNCTION public.is_attendance_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND is_attendance_manager = true
  )
$$;

-- Create function to check if user is returns handler
CREATE OR REPLACE FUNCTION public.is_returns_handler(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND is_returns_handler = true
  )
$$;

-- Update RLS policy for returns - cashier can initiate (only their own receipts)
DROP POLICY IF EXISTS "Cashiers and admins can create returns" ON public.returns;

CREATE POLICY "Cashiers can initiate returns for own sales"
ON public.returns
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales 
    WHERE id = sale_id AND cashier_id = auth.uid()
  )
  OR is_admin(auth.uid())
);

-- Returns handlers can update returns (approve/reject)
CREATE POLICY "Returns handlers can approve returns"
ON public.returns
FOR UPDATE
USING (
  is_returns_handler(auth.uid()) OR is_admin(auth.uid())
);

-- Update attendance RLS policies
DROP POLICY IF EXISTS "Users can view own attendance" ON public.attendance;

CREATE POLICY "Users can view attendance"
ON public.attendance
FOR SELECT
USING (
  user_id = auth.uid() 
  OR is_admin(auth.uid())
  OR is_attendance_manager(auth.uid())
);

DROP POLICY IF EXISTS "Users can clock in/out" ON public.attendance;

CREATE POLICY "Users and managers can create attendance"
ON public.attendance
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR is_attendance_manager(auth.uid())
  OR is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Users can update own attendance" ON public.attendance;

CREATE POLICY "Users and managers can update attendance"
ON public.attendance
FOR UPDATE
USING (
  user_id = auth.uid()
  OR is_attendance_manager(auth.uid())
  OR is_admin(auth.uid())
);

-- Update the update_stock_on_return trigger to only fire when return is approved
CREATE OR REPLACE FUNCTION public.update_stock_on_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only update stock when return is approved
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.products
    SET quantity_in_stock = quantity_in_stock + NEW.quantity,
        updated_at = now()
    WHERE id = (SELECT product_id FROM public.sale_items WHERE id = NEW.sale_item_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Drop old trigger and recreate
DROP TRIGGER IF EXISTS on_return_created ON public.returns;
DROP TRIGGER IF EXISTS on_return_update_stock ON public.returns;

CREATE TRIGGER on_return_update_stock
AFTER INSERT OR UPDATE ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.update_stock_on_return();