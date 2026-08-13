-- ============================================================
-- Open cached_routes + telemetry_aggregated to authenticated
-- users. The V2 frontend reads the route cache and writes hourly
-- telemetry summaries from the browser (PB had these admin-only;
-- V2 requires browser access, service-role still bypasses RLS).
-- ============================================================

create policy cached_routes_read_authenticated on public.cached_routes for select
  using (auth.uid() is not null);
create policy cached_routes_insert_authenticated on public.cached_routes for insert
  with check (auth.uid() is not null);
create policy cached_routes_update_authenticated on public.cached_routes for update
  using (auth.uid() is not null);
create policy cached_routes_delete_authenticated on public.cached_routes for delete
  using (auth.uid() is not null);

create policy telemetry_read_authenticated on public.telemetry_aggregated for select
  using (auth.uid() is not null);
create policy telemetry_insert_authenticated on public.telemetry_aggregated for insert
  with check (auth.uid() is not null);
create policy telemetry_update_authenticated on public.telemetry_aggregated for update
  using (auth.uid() is not null);
create policy telemetry_delete_authenticated on public.telemetry_aggregated for delete
  using (auth.uid() is not null);
