# Ranking v1 (TI-270)

This document describes the v1 ranking formulas used to order feeds/search results.

## Deals (`sort=trend`)

### Inputs

- `temperature` (0..100, nullable; default 50)
- `active_at` (nullable; falls back to `created_at` for recency)
- `created_at`
- `as_of` (fixed timestamp stored in cursor to keep pagination stable)
- `duplicate_rank` (1 for canonical, 2+ for duplicates with same `source_url_fingerprint`)
- `hidden` (from `moderation_states`)

### Components

- `temperature_score = clamp(temperature ?? 50, 0..100)`
- `age_hours = max((as_of - (active_at ?? created_at)) / 1h, 0)`
- `recency_score = 100 * 12 / (12 + age_hours)`
- `duplicate_penalty = 15 * max(duplicate_rank - 1, 0)`
- `hidden_penalty = 10000 if hidden=true else 0`

### Final score

`rank_score = temperature_score + recency_score - duplicate_penalty - hidden_penalty`

### Ordering (stable)

`ORDER BY rank_score DESC, created_at DESC, deal_id DESC`

Hidden items are filtered out for standard clients (unless explicitly requested via `include_hidden`).

## Listings (`sort=rank`)

### Inputs

- `created_at`
- `as_of` (fixed timestamp stored in cursor to keep pagination stable)
- optional price range: `price_min`, `price_max`
- seller trust context (from `agents`): `trust_score`, `trust_flags`
- `hidden` (from `moderation_states`)

### Components

- `age_hours = max((as_of - created_at) / 1h, 0)`
- `recency_score = 100 * 24 / (24 + age_hours)`

Trust band (bonus):

- if flags contain any of `restricted`, `suspended`, `under_review` => `trust_bonus = -50`
- else if `trust_score >= 80` => `trust_bonus = +20`
- else if `trust_score >= 50` => `trust_bonus = +10`
- else `trust_bonus = 0`

Price fit (optional):

- Only applied when both `price_min` and `price_max` are provided and `price_max > price_min`.
- `center = (price_min + price_max) / 2`
- `span = max((price_max - price_min) / 2, 1)`
- `closeness = 1 - min(abs(price - center) / span, 1)`
- `price_bonus = 10 * closeness`

Hidden penalty:

- `hidden_penalty = 10000 if hidden=true else 0`

### Final score

`rank_score = recency_score + trust_bonus + price_bonus - hidden_penalty`

### Ordering (stable)

`ORDER BY rank_score DESC, created_at DESC, listing_id DESC`

Hidden items are filtered out for standard clients (unless explicitly requested via `include_hidden`).

