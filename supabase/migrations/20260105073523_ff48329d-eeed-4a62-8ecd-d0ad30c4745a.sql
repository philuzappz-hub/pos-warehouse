-- Add permission flags to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_attendance_manager BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN is_returns_handler BOOLEAN NOT NULL DEFAULT false;

-- Modify the returns table to support two-step approval workflow
ALTER TABLE public.returns 
ADD COLUMN initiated_by UUID REFERENCES auth.users(id),
ADD COLUMN approved_by UUID REFERENCES auth.users(id),
ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- Create index for faster queries on returns status
CREATE INDEX idx_returns_status ON public.returns(status);

-- Update existing returns to be 'approved' status (backwards compatibility)
UPDATE public.returns SET status = 'approved', initiated_by = processed_by WHERE status = 'pending';