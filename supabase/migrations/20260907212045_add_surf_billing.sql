-- Server-only account association and billing event journal. No browser role
-- may read customer IDs, change plans, or grant itself subscription access.
create table public.surf_billing_customers (
  user_id uuid not null references auth.users(id) on delete restrict,
  livemode boolean not null,
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  checkout_nonce uuid not null default gen_random_uuid(),
  checkout_started_at timestamptz not null default now(),
  checkout_session_id text check (checkout_session_id is null or checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  created_at timestamptz not null default now(),
  primary key (user_id, livemode),
  unique (stripe_customer_id, livemode)
);

create table public.surf_billing_subscriptions (
  stripe_subscription_id text not null check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  livemode boolean not null,
  stripe_customer_id text not null,
  price_id text check (price_id is null or price_id ~ '^price_[A-Za-z0-9]+$'),
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end timestamptz,
  cancel_at timestamptz,
  observed_at timestamptz not null,
  primary key (stripe_subscription_id, livemode),
  foreign key (stripe_customer_id, livemode) references public.surf_billing_customers(stripe_customer_id, livemode) on delete restrict
);
create index surf_billing_subscription_customer on public.surf_billing_subscriptions (stripe_customer_id, livemode);

create table public.surf_billing_events (
  stripe_event_id text not null check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  livemode boolean not null,
  event_type text not null check (length(event_type) between 1 and 100),
  stripe_created_at timestamptz not null,
  processed_at timestamptz not null default now(),
  primary key (stripe_event_id, livemode)
);

alter table public.surf_billing_customers enable row level security;
alter table public.surf_billing_subscriptions enable row level security;
alter table public.surf_billing_events enable row level security;
revoke all on table public.surf_billing_customers, public.surf_billing_subscriptions, public.surf_billing_events from public, anon, authenticated, service_role;
grant select, insert, update on table public.surf_billing_customers to service_role;
grant select, insert, update on table public.surf_billing_subscriptions to service_role;
grant select, insert on table public.surf_billing_events to service_role;

-- A durable nonce keeps concurrent clicks, retries and process restarts on the
-- same Stripe Checkout Session. Only rotate after Stripe confirms expiry or a
-- completed subscription is terminal. A never-saved attempt expires after 25h,
-- safely beyond Checkout's default 24h lifetime and Stripe's retry window.
create function public.surf_prepare_billing_checkout(p_user_id uuid, p_livemode boolean, p_rotate_nonce uuid default null)
returns setof public.surf_billing_customers
language plpgsql security invoker set search_path = '' as $$
declare v_row public.surf_billing_customers;
begin
  select * into strict v_row from public.surf_billing_customers
  where user_id = p_user_id and livemode = p_livemode for update;
  if (p_rotate_nonce is not null and p_rotate_nonce = v_row.checkout_nonce)
    or (v_row.checkout_session_id is null and v_row.checkout_started_at < now() - interval '25 hours') then
    update public.surf_billing_customers set checkout_nonce = gen_random_uuid(),
      checkout_started_at = now(), checkout_session_id = null
    where user_id = p_user_id and livemode = p_livemode returning * into v_row;
  end if;
  return next v_row;
end;
$$;
revoke all on function public.surf_prepare_billing_checkout(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.surf_prepare_billing_checkout(uuid, boolean, uuid) to service_role;

-- Journal + reconciliation are atomic. Duplicate deliveries do not apply twice;
-- a slow older fetch cannot overwrite a more recently observed Stripe state.
create function public.surf_record_billing_event(
  p_event_id text, p_livemode boolean, p_event_type text, p_created_at timestamptz,
  p_subscription_id text, p_customer_id text, p_price_id text, p_status text,
  p_period_end timestamptz, p_cancel_at timestamptz, p_observed_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_inserted integer;
begin
  if p_observed_at > now() + interval '5 minutes' then raise exception 'Invalid observation time'; end if;
  insert into public.surf_billing_events (stripe_event_id, livemode, event_type, stripe_created_at)
  values (p_event_id, p_livemode, p_event_type, p_created_at) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return; end if;
  insert into public.surf_billing_subscriptions (
    stripe_subscription_id, livemode, stripe_customer_id, price_id, status, current_period_end, cancel_at, observed_at
  ) values (p_subscription_id, p_livemode, p_customer_id, p_price_id, p_status, p_period_end, p_cancel_at, p_observed_at)
  on conflict (stripe_subscription_id, livemode) do update set
    price_id = excluded.price_id, status = excluded.status, current_period_end = excluded.current_period_end,
    cancel_at = excluded.cancel_at, observed_at = excluded.observed_at
  where public.surf_billing_subscriptions.stripe_customer_id = excluded.stripe_customer_id
    and public.surf_billing_subscriptions.observed_at <= excluded.observed_at;
end;
$$;
revoke all on function public.surf_record_billing_event(text, boolean, text, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.surf_record_billing_event(text, boolean, text, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;
notify pgrst, 'reload schema';
