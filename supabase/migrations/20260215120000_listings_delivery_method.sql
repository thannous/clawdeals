-- Add delivery_method to listings (PICKUP, SHIPPING, BOTH)
-- All nullable for backward compatibility

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS delivery_method text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listings_delivery_method_check'
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_delivery_method_check
      CHECK (delivery_method IN ('PICKUP', 'SHIPPING', 'BOTH'));
  END IF;
END $$;
