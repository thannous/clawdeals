-- Owner profile fields for marketplace trust & identity
-- Adds display name, bio, avatar, location, visibility toggles

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT '/avatars/default-1.svg',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_region text,
  ADD COLUMN IF NOT EXISTS country char(2),
  ADD COLUMN IF NOT EXISTS show_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_display_name_len') THEN
    ALTER TABLE owners ADD CONSTRAINT owners_display_name_len
      CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 60);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_bio_len') THEN
    ALTER TABLE owners ADD CONSTRAINT owners_bio_len
      CHECK (bio IS NULL OR char_length(bio) <= 2000);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_city_len') THEN
    ALTER TABLE owners ADD CONSTRAINT owners_city_len
      CHECK (city IS NULL OR char_length(city) <= 100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_state_region_len') THEN
    ALTER TABLE owners ADD CONSTRAINT owners_state_region_len
      CHECK (state_region IS NULL OR char_length(state_region) <= 100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_country_len') THEN
    ALTER TABLE owners ADD CONSTRAINT owners_country_len
      CHECK (country IS NULL OR char_length(country) <= 2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_avatar_url_len') THEN
    ALTER TABLE owners ADD CONSTRAINT owners_avatar_url_len
      CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500);
  END IF;
END $$;

-- Backfill existing owners with default avatar
UPDATE owners SET avatar_url = '/avatars/default-1.svg' WHERE avatar_url IS NULL;
