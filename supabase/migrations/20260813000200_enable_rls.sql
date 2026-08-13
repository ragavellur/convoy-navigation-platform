-- ============================================================
-- Row Level Security - mirrors PocketBase access rules
-- (see scripts/setup-collections.py Phase 2)
-- PB ""  = open to anyone (incl. anon)
-- PB "@request.auth.id ..." = authenticated user match
-- PB null = admin/service-role only -> no RLS policy here
-- ============================================================

alter table public.profiles            enable row level security;
alter table public.vehicles            enable row level security;
alter table public.convoys             enable row level security;
alter table public.convoy_members      enable row level security;
alter table public.positions           enable row level security;
alter table public.messages            enable row level security;
alter table public.cached_routes       enable row level security;
alter table public.telemetry_aggregated enable row level security;
alter table public.push_subscriptions  enable row level security;

-- ------------------------------------------------------------------
-- profiles (mirrors _pb_users_auth_: readable by all, writable by self)
-- ------------------------------------------------------------------
create policy profiles_read_all on public.profiles for select using (true);
create policy profiles_insert_self on public.profiles for insert
  with check (auth.uid() = id);
create policy profiles_update_self on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- ------------------------------------------------------------------
-- vehicles (PB: create open, update/delete = owner, list/view open)
-- ------------------------------------------------------------------
create policy vehicles_read_all on public.vehicles for select using (true);
create policy vehicles_insert_authenticated on public.vehicles for insert
  with check (auth.uid() is not null);
create policy vehicles_update_owner on public.vehicles for update
  using (auth.uid() = owner) with check (auth.uid() = owner);
create policy vehicles_delete_owner on public.vehicles for delete
  using (auth.uid() = owner);

-- ------------------------------------------------------------------
-- convoys (PB: create authenticated, update/delete = owner, list/view open)
-- ------------------------------------------------------------------
create policy convoys_read_all on public.convoys for select using (true);
create policy convoys_insert_authenticated on public.convoys for insert
  with check (auth.uid() is not null);
create policy convoys_update_owner on public.convoys for update
  using (auth.uid() = owner) with check (auth.uid() = owner);
create policy convoys_delete_owner on public.convoys for delete
  using (auth.uid() = owner);

-- ------------------------------------------------------------------
-- convoy_members (PB: create authenticated, update/delete open, list/view open)
-- ------------------------------------------------------------------
create policy convoy_members_read_all on public.convoy_members for select using (true);
create policy convoy_members_insert_authenticated on public.convoy_members for insert
  with check (auth.uid() is not null);
create policy convoy_members_update_all on public.convoy_members for update
  using (true);
create policy convoy_members_delete_all on public.convoy_members for delete
  using (true);

-- ------------------------------------------------------------------
-- positions (PB: all rules open)
-- ------------------------------------------------------------------
create policy positions_read_all on public.positions for select using (true);
create policy positions_insert_all on public.positions for insert with check (true);
create policy positions_update_all on public.positions for update using (true);
create policy positions_delete_all on public.positions for delete using (true);

-- ------------------------------------------------------------------
-- messages (PB: create authenticated, update/delete = sender, list/view open)
-- ------------------------------------------------------------------
create policy messages_read_all on public.messages for select using (true);
create policy messages_insert_authenticated on public.messages for insert
  with check (auth.uid() is not null);
create policy messages_update_sender on public.messages for update
  using (auth.uid() = sender) with check (auth.uid() = sender);
create policy messages_delete_sender on public.messages for delete
  using (auth.uid() = sender);

-- ------------------------------------------------------------------
-- cached_routes (PB: null rules -> admin/service-role only, no policy)
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- telemetry_aggregated (PB: null rules -> admin/service-role only, no policy)
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- push_subscriptions (PB: list authenticated, rest = user)
-- ------------------------------------------------------------------
create policy push_subscriptions_read_authenticated on public.push_subscriptions for select
  using (auth.uid() is not null);
create policy push_subscriptions_insert_authenticated on public.push_subscriptions for insert
  with check (auth.uid() is not null);
create policy push_subscriptions_update_user on public.push_subscriptions for update
  using (auth.uid() = "user") with check (auth.uid() = "user");
create policy push_subscriptions_delete_user on public.push_subscriptions for delete
  using (auth.uid() = "user");
