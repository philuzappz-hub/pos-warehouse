-- Fix function search_path for generate_receipt_number
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
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