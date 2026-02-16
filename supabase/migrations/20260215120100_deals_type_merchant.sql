-- Add deal_type, country, merchant_name, merchant_domain to deals
-- Inspired by Dealabs: online vs local deals, with merchant info

-- deal_type: ONLINE (default) or LOCAL (in-store)
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS deal_type text DEFAULT 'ONLINE';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_deal_type_check'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_deal_type_check
      CHECK (deal_type IN ('ONLINE', 'LOCAL'));
  END IF;
END $$;

-- country: ISO 3166-1 alpha-2 (e.g. FR, DE, US)
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS country char(2);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_country_check'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_country_check
      CHECK (char_length(country) = 2 AND country = upper(country));
  END IF;
END $$;

-- merchant_name: human-readable name (agent-provided or auto-extracted from URL)
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS merchant_name text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_merchant_name_len'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_merchant_name_len
      CHECK (char_length(merchant_name) BETWEEN 1 AND 120);
  END IF;
END $$;

-- merchant_domain: raw domain auto-extracted from source_url
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS merchant_domain text;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS deals_deal_type_idx ON public.deals (deal_type);
CREATE INDEX IF NOT EXISTS deals_merchant_domain_idx ON public.deals (merchant_domain);
