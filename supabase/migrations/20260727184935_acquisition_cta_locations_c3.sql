alter table public.acquisition_funnel_events
  drop constraint if exists acquisition_funnel_events_cta_check;

alter table public.acquisition_funnel_events
  add constraint acquisition_funnel_events_cta_check
  check (
    cta_location is null
    or cta_location in (
      'navbar',
      'hero',
      'showcase_deals',
      'showcase_marketplace',
      'feature_footer',
      'explore_card',
      'explore_footer',
      'mcp',
      'browse',
      'landing_activation',
      'mcp_activation',
      'openclaw_activation',
      'comparison_activation',
      'other'
    )
  );
