create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  onboarding_completed_at timestamptz,
  recovery_public_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.intentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  step_position integer not null check (step_position between 1 and 5),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'RUB' check (currency = 'RUB'),
  reflection_after_days integer not null default 7 check (reflection_after_days > 0),
  status text not null check (status in ('draft', 'active', 'completed')),
  encrypted_payload text not null,
  payload_iv text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  reflection_deferred_until timestamptz,
  unique (user_id, step_position),
  check (
    (status = 'draft' and activated_at is null and completed_at is null) or
    (status = 'active' and activated_at is not null and completed_at is null) or
    (status = 'completed' and activated_at is not null and completed_at is not null)
  )
);

create unique index intentions_one_unfinished_per_user
  on public.intentions (user_id) where status in ('draft', 'active');
create index intentions_history_by_user on public.intentions (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.intentions enable row level security;

create policy "profiles belong to the signed-in user"
  on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "intentions belong to the signed-in user"
  on public.intentions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles, public.intentions from anon;
grant select, insert, update, delete on public.profiles, public.intentions to authenticated;
